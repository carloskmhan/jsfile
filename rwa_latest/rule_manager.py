#!/usr/bin/env python3
"""RWA local rule workbench. Python 3.10+ standard library; loopback only.

python rule_manager.py [--port 8765] [--project /path/to/full/v6/project] [--no-open]
The browser edits draft tables; the EXISTING compiler validates them. Only an explicit
save writes CSVs and command_patterns.txt. No model, shell commands, or remote AI.
"""
from __future__ import annotations
import argparse
import base64
import csv
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from collections import OrderedDict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = '2.0.0-simple-review'
from capability_manager import Capabilities, META_HEADERS
APP_DIR = Path(__file__).resolve().parent / 'local_manager'
MAX_BODY = 12_000_000
MAX_FILE = 4_000_000
MAX_CELL = 8000
MAX_DRAFTS = 5
DRAFT_TTL = 1800
RUNTIME_ROOT = ('rule_parser.js', 'rwa_engine.js', 'csv_adapter.js', 'group_catalog.js', 'tableau_adapter.js', 'network.js', 'driver_catalog.js', 'historical_peaks.js')
META = {
 'synonyms.csv': ('Expressions & synonyms', 'Map new expressions to existing concepts such as ROOT and INCREASE.', ['concept','phrase','weight','enabled']),
 'followups.csv': ('Follow-ups', 'Define which slots to update from the last successful analysis.', ['rule_id','pattern','patch_type','target_slot','enabled']),
 'commands.csv': ('Commands & weights', 'Configure existing execution functions and grammar. This does not automatically create new calculations.', ['command_id','intent','action','grammar','min_confidence','enabled']),
 'fuzzy_config.csv': ('Safe typo recovery', 'Numbers, units, dates and short abbreviations are not autocorrected.', ['category','min_length','threshold','max_edits','enabled']),
 'units.csv': ('Number units', 'Keep standard unit meanings and fixed multipliers.', ['phrase','kind','multiplier','enabled']),
 'temporal.csv': ('Period expressions', 'Define months and relative periods. The reference month comes from the analysis context.', ['phrase','kind','value','enabled']),
 'settings.csv': ('Context & limits', 'Previous result values are never inherited. The compiler validates safety limits.', ['key','value']),
}

class ManagerError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = 'INVALID_REQUEST', **details):
        super().__init__(message)
        self.status, self.code, self.details = status, code, details


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded_json(obj: object) -> bytes:
    return json.dumps(obj, ensure_ascii=False, allow_nan=False, indent=2).encode('utf-8')


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_bytes(path: Path, data: bytes) -> None:
    """Atomic for ONE file, not a claim of multi-file atomicity."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ManagerError('Symbolic-link output is not supported: ' + path.name)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.rm-', delete=False) as f:
            tmp = Path(f.name)
            f.write(data); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp, (path.stat().st_mode & 0o777) if path.exists() else 0o600)
        os.replace(tmp, path); tmp = None
        if hasattr(os, 'O_DIRECTORY'):
            fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
    finally:
        if tmp is not None: tmp.unlink(missing_ok=True)


class ProjectLock:
    """OS-released advisory lock; prevents two workbenches for the same project."""
    def __init__(self, path: Path):
        if path.is_symlink(): raise ManagerError('Unsafe lock path.')
        self.file = path.open('a+b')
        self.file.seek(0)
        if path.stat().st_size == 0: self.file.write(b'0'); self.file.flush()
        self.file.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            self.file.close()
            raise ManagerError('Another rule manager is already open for this project. Close it first.') from e
    def close(self):
        if not self.file.closed: self.file.close()


class Workbench:
    error_type = ManagerError
    def __init__(self, root: Path):
        self.root = root.resolve()
        for name in ['build_command_patterns.py','tools/rule_schema.py','tools/compiler_extensions.py','semantic/engine.js','semantic/registry.js']:
            self.safe_path(name, required=True)
        # This is trusted source code from the selected project, never supplied through HTTP.
        schema_path = self.safe_path('tools/rule_schema.py', required=True)
        spec = importlib.util.spec_from_file_location('_rwa_manager_schema', schema_path)
        self.schema = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.schema)
        self.headers = self.schema.HEADERS
        if set(self.headers) != set(META):
            raise ManagerError('This workbench supports the seven model-free v6 rule CSVs. Customer names come from Tableau, not the editor.')
        if not str(self.schema.ENGINE_VERSION).startswith('6.'):
            raise ManagerError('Use this full v6 source project, not the web-only subset.')
        self.composition_sources = ['rules/lexical_families.csv','rules/composition_rules.csv']
        self.managed = [f'rules/{name}' for name in self.headers] + list(META_HEADERS) + self.composition_sources + ['command_patterns.txt']
        self.lock = threading.RLock()
        self.token = secrets.token_urlsafe(32)
        self.drafts = OrderedDict()
        self.store = self.safe_path('.rule_manager', required=False)
        self.store.mkdir(mode=0o700, exist_ok=True)
        self.safe_path('.rule_manager/backups').mkdir(mode=0o700, exist_ok=True)
        self.process_lock = ProjectLock(self.store / 'manager.lock')
        self.recovery = self.recover()
        self.runtime = {}
        for rel in list(RUNTIME_ROOT) + [p.relative_to(self.root).as_posix() for p in (self.root/'semantic').glob('*.js')]:
            p = self.safe_path(rel, required=True)
            self.runtime['/engine/' + rel] = p.read_bytes()
        self.runtime_hash = digest(encoded_json({k:digest(v) for k,v in sorted(self.runtime.items())}))
        self.source_code_hash = self.code_hash()
        # A bounded local fixture. No Tableau credentials/configuration or network connection.
        self.test_assets = {}
        for name, default in [('tableau_sample.csv',''), ('rules_config.txt','{}')]:
            path = self.safe_path(name)
            raw = path.read_bytes() if path.exists() else default.encode()
            if len(raw)>8_000_000: raise ManagerError('Local test asset exceeds 8 MB: '+name)
            self.test_assets[name] = raw.decode('utf-8-sig')
        self.read_snapshot()  # fail early for missing or malformed source
        self.capabilities = Capabilities(self)
        self.capabilities.read_meta()

    def close(self):
        self.drafts.clear()
        self.process_lock.close()

    def safe_path(self, rel: str, required: bool = False) -> Path:
        p = self.root / rel
        if not p.resolve().is_relative_to(self.root): raise ManagerError('Path leaves the project.')
        for q in (p, *p.parents):
            if q == self.root: break
            if q.is_symlink(): raise ManagerError('Symlink paths are not supported: '+rel)
        if required and not p.is_file(): raise ManagerError('Missing full-project file: '+rel)
        return p

    def code_hash(self):
        paths = ['build_command_patterns.py','tools/rule_schema.py','tools/compiler_extensions.py']
        if (self.root/'tools/composition_rules.py').is_file(): paths.append('tools/composition_rules.py')
        paths += [p.relative_to(self.root).as_posix() for p in (self.root/'semantic').glob('*.js')]
        paths += list(RUNTIME_ROOT)
        return digest(encoded_json({x:digest(self.safe_path(x,True).read_bytes()) for x in sorted(set(paths))}))

    def check_code(self):
        if self.code_hash()!=self.source_code_hash:
            raise ManagerError('Engine/compiler files changed. Restart the manager before compiling or saving.',409,'SOURCE_CHANGED')

    def read_bytes_map(self):
        out={}
        for rel in self.managed:
            p=self.safe_path(rel)
            if p.exists():
                if p.stat().st_size>MAX_FILE: raise ManagerError('File exceeds limit: '+rel)
                out[rel]=p.read_bytes()
            elif rel=='command_patterns.txt' or rel in META_HEADERS or rel in self.composition_sources: out[rel]=None
            else: raise ManagerError('Missing rule CSV: '+rel)
        return out

    @staticmethod
    def revision_of(blobs):
        return digest(encoded_json({k:digest(v) if v is not None else None for k,v in sorted(blobs.items())}))

    def parse_csv(self, name, raw):
        if not isinstance(name,str) or name not in self.headers: raise ManagerError('Unknown rule CSV.')
        try:
            text=raw.decode('utf-8-sig') if isinstance(raw,bytes) else raw.lstrip('\ufeff')
            if len(text.encode('utf-8'))>MAX_FILE: raise ManagerError('CSV exceeds 4 MB.')
            r=csv.reader(io.StringIO(text,newline=''),strict=True)
            header=next(r)
            if header!=self.headers[name]: raise ManagerError(f'{name}: expected header: '+','.join(self.headers[name]))
            rows=[];lines=[]
            for row in r:
                if not row or not any(row): continue
                if len(row)!=len(header): raise ManagerError(f'{name} line {r.line_num}: CSV column count mismatch.')
                rows.append(dict(zip(header,row)));lines.append(r.line_num)
            return {'headers':header,'rows':rows,'lines':lines}
        except (UnicodeError,csv.Error,StopIteration) as e: raise ManagerError(f'{name}: invalid UTF-8 CSV: {e}') from e

    def read_snapshot(self):
        with self.lock:
            return self._read_snapshot()

    def _read_snapshot(self):
        blobs=self.read_bytes_map()
        tables={name:self.parse_csv(name,blobs['rules/'+name]) for name in self.headers}
        artifact=blobs['command_patterns.txt']
        consistent=False
        try:
            parsed=json.loads('\n'.join(line for line in artifact.decode('utf-8-sig').splitlines() if not line.startswith('#')))
            consistent=all(parsed['sourceSha256'].get(n)==digest(blobs['rules/'+n]) for n in self.headers)
            consistent=consistent and all(parsed['sourceSha256'].get(Path(rel).name)==(digest(blobs[rel]) if blobs[rel] is not None else None) for rel in self.composition_sources)
        except (AttributeError,KeyError,ValueError,TypeError): pass
        return {'revision':self.revision_of(blobs),'tables':tables,'artifactHash':digest(artifact) if artifact else None,
                'artifactConsistent':consistent,'generatedText':artifact.decode('utf-8') if artifact else '',
                'runtimeHash':self.runtime_hash if hasattr(self,'runtime_hash') else '',
                'backupCount':len(list((self.store/'backups').glob('*/manifest.json')))}

    def bootstrap(self):
        with self.lock:
            snap=self.read_snapshot()
            return {**snap,'csrfToken':self.token,'managerVersion':VERSION,'engineVersion':self.schema.ENGINE_VERSION,
                    'projectName':self.root.name,'projectPath':str(self.root),'recovery':self.recovery,
                    'metadata':{k:{'title':v[0],'description':v[1],'columns':v[2]} for k,v in META.items()},
                    'choices':{'concepts':sorted(self.schema.CONCEPTS),'slots':sorted(self.schema.SLOTS),
                        'actions':sorted(self.schema.ACTIONS),'grammars':sorted(self.schema.GRAMMARS),
                        'patches':sorted(self.schema.PATCHES),'templateSlots':sorted(self.schema.TEMPLATE_SLOTS)}}

    def encode_tables(self, tables, snapshot):
        if not isinstance(tables,dict) or set(tables)!=set(self.headers):
            raise ManagerError('Send all current rule tables. Missing/extra tables are not allowed.')
        blobs={}
        caps={'commands.csv':100,'synonyms.csv':3000,'aliases.csv':10000,'followups.csv':1000}
        for name,header in self.headers.items():
            t=tables[name]
            if not isinstance(t,dict) or t.get('headers')!=header or not isinstance(t.get('rows'),list):
                raise ManagerError(f'{name}: incompatible table schema.')
            if len(t['rows'])>caps.get(name,1000): raise ManagerError(f'{name}: row limit exceeded.')
            for idx,row in enumerate(t['rows'],2):
                if not isinstance(row,dict) or set(row)!=set(header): raise ManagerError(f'{name} row {idx}: column mismatch.')
                for field,value in row.items():
                    if not isinstance(value,str) or len(value)>MAX_CELL or '\x00' in value:
                        raise ManagerError(f'{name} row {idx}: {field} must be bounded plain text.')
                    v=value.lstrip()
                    if v.startswith(('=','+','@')) or (v.startswith('-') and not re.fullmatch(r'-\d+(?:\.\d+)?',v)):
                        raise ManagerError(f'{name} row {idx}: formula-like cell rejected ({field}).',400,'UNSAFE_CELL')
            old=snapshot['tables'][name]
            if t['rows']==old['rows']:
                blobs['rules/'+name]=self.safe_path('rules/'+name,True).read_bytes()
            else:
                s=io.StringIO(newline='');w=csv.DictWriter(s,fieldnames=header,lineterminator='\n')
                w.writeheader();w.writerows(t['rows']);raw=s.getvalue().encode('utf-8')
                if len(raw)>MAX_FILE: raise ManagerError(f'{name}: exceeds file size limit.')
                blobs['rules/'+name]=raw
        for rel in self.composition_sources: blobs[rel]=self.read_bytes_map()[rel]
        return blobs

    def compile_blobs(self, blobs):
        self.check_code()
        with tempfile.TemporaryDirectory(prefix='rwa-rule-check-') as temp:
            tmp=Path(temp);rules=tmp/'rules';rules.mkdir()
            for name in self.headers: (rules/name).write_bytes(blobs['rules/'+name])
            for rel in self.composition_sources:
                if blobs.get(rel) is not None: (rules/Path(rel).name).write_bytes(blobs[rel])
            out=tmp/'command_patterns.txt'
            proc=subprocess.run([sys.executable,str(self.root/'build_command_patterns.py'),
                 '--rules-dir',str(rules),'--out',str(out)],cwd=self.root,capture_output=True,text=True,
                 encoding='utf-8',errors='replace',timeout=30,env={**os.environ,'PYTHONUTF8':'1','PYTHONDONTWRITEBYTECODE':'1'})
            log=(proc.stdout+'\n'+proc.stderr).strip().replace(str(tmp),'<validation-draft>')
            if proc.returncode or not out.exists():
                m=re.search(r'([a-z_]+\.csv) line (\d+):',log)
                raise ManagerError(log or 'Compiler failed.',422,'COMPILER_VALIDATION',
                    file=m[1] if m else None,line=int(m[2]) if m else None)
            generated=out.read_bytes()
            data=json.loads('\n'.join(l for l in generated.decode('utf-8').splitlines() if not l.startswith('#')))
            if data.get('schemaVersion')!=5: raise ManagerError('Incompatible generated schema.')
            return generated,log,data

    def validate(self, payload):
        with self.lock:
            snap=self.read_snapshot()
            if payload.get('revision')!=snap['revision']:
                raise ManagerError('Files changed on disk or in another tab. Reload before merging your draft.',409,'REVISION_CONFLICT')
            blobs=self.encode_tables(payload.get('tables'),snap)
            current_blobs=self.read_bytes_map()
            for rel in [*META_HEADERS,*self.composition_sources]: blobs[rel]=current_blobs[rel]
            generated,log,data=self.compile_blobs(blobs)
            if self.revision_of(self.read_bytes_map())!=snap['revision']:
                raise ManagerError('Files changed during validation. Reload and retry.',409,'REVISION_CONFLICT')
            changes=[]
            for name in self.headers:
                before=snap['tables'][name]['rows'];after=payload['tables'][name]['rows']
                if before!=after: changes.append({'file':name,'beforeRows':len(before),'afterRows':len(after)})
            key=secrets.token_urlsafe(24)
            self.drafts[key]={'base':snap['revision'],'blobs':{**blobs,'command_patterns.txt':generated},
                              'created':time.time(),'changes':changes,'hash':digest(generated)}
            while len(self.drafts)>MAX_DRAFTS: self.drafts.popitem(last=False)
            return {'ok':True,'draftId':key,'revision':snap['revision'],'generatedText':generated.decode('utf-8'),
                    'artifactHash':digest(generated),'changes':changes,'log':log,'expiresInSeconds':DRAFT_TTL,
                    'counts':{k:len(data[k]) for k in ['commands','synonyms','aliases','followups']},
                    'overlapAudit':data.get('phraseOverlaps',data.get('phraseAudit',[]))}

    def get_draft(self, key):
        if not isinstance(key,str): raise ManagerError('Invalid draft ID.')
        draft=self.drafts.get(key)
        if not draft or time.time()-draft['created']>DRAFT_TTL:
            raise ManagerError('Draft expired or the server restarted. Validate again.',409,'DRAFT_EXPIRED')
        return draft

    def backup_dir(self, key):
        if not isinstance(key,str) or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{12}',key):
            raise ManagerError('Invalid backup ID.')
        return self.safe_path('.rule_manager/backups/'+key,False)

    def load_before(self,key):
        folder=self.backup_dir(key)
        p=folder/'manifest.json'
        if not p.is_file() or p.is_symlink(): raise ManagerError('Backup not found.',404)
        manifest=json.loads(p.read_text('utf-8'))
        # Old pre-wizard backups legitimately have no optional card CSV entries.
        for section in ['beforeHashes','afterHashes']:
            for rel in [*META_HEADERS,*self.composition_sources]: manifest[section].setdefault(rel,None)
        if set(manifest['beforeHashes'])!=set(self.managed) or set(manifest['afterHashes'])!=set(self.managed): raise ManagerError('Invalid backup manifest.')
        before={}
        for rel,h in manifest['beforeHashes'].items():
            if h is None: before[rel]=None;continue
            fp=self.safe_path(f'.rule_manager/backups/{key}/before/{rel}',True)
            raw=fp.read_bytes()
            if digest(raw)!=h: raise ManagerError('Backup integrity failed: '+rel,409,'BACKUP_INTEGRITY')
            before[rel]=raw
        return manifest,before

    def write_transaction(self, after, expected, note):
        """Serialize saves, persist a journal, atomically replace each file; generated artifact LAST.
        Recovery is required after interruption. Other filesystem editors do not honor this lock.
        """
        self.check_code()
        if (self.store/'pending.json').exists():
            raise ManagerError('A previous transaction still needs recovery. Restart and resolve it before saving.',409,'RECOVERY_REQUIRED')
        before=self.read_bytes_map()
        if self.revision_of(before)!=expected: raise ManagerError('Save conflict. Reload latest files.',409,'REVISION_CONFLICT')
        key=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(6)
        folder=self.backup_dir(key);folder.mkdir(mode=0o700)
        manifest={'id':key,'createdAt':timestamp(),'note':str(note)[:300],'status':'prepared',
                  'beforeRevision':expected,'afterRevision':self.revision_of(after),
                  'beforeHashes':{k:digest(v) if v is not None else None for k,v in before.items()},
                  'afterHashes':{k:digest(v) if v is not None else None for k,v in after.items()}}
        for rel,raw in before.items():
            if raw is not None: atomic_bytes(folder/'before'/rel,raw)
        atomic_bytes(folder/'manifest.json',encoded_json(manifest))
        pending=self.store/'pending.json'
        atomic_bytes(pending,encoded_json({'backupId':key}))
        try:
            # Reject a concurrent external change immediately before the first replacement.
            if self.revision_of(self.read_bytes_map())!=expected:
                raise ManagerError('Files changed before save; draft not committed.',409,'REVISION_CONFLICT')
            for rel in self.managed:  # artifact last
                if before[rel]!=after[rel]:
                    if after[rel] is None: self.safe_path(rel).unlink(missing_ok=True)
                    else: atomic_bytes(self.safe_path(rel),after[rel])
            manifest['status']='committed';manifest['finishedAt']=timestamp()
            atomic_bytes(folder/'manifest.json',encoded_json(manifest))
            pending.unlink()
        except BaseException:
            # Rollback only when current files are known transaction states, never overwrite unknown edits.
            self.recover()
            raise
        return key

    def recover(self):
        pending=self.safe_path('.rule_manager/pending.json')
        if not pending.exists(): return None
        data=json.loads(pending.read_text('utf-8'));key=data['backupId']
        manifest,before=self.load_before(key)
        current=self.read_bytes_map()
        hashes={k:digest(v) if v is not None else None for k,v in current.items()}
        folder=self.backup_dir(key)
        if hashes==manifest['afterHashes']:
            manifest['status']='committed-recovered'
        else:
            if any(h not in (manifest['beforeHashes'][k],manifest['afterHashes'][k]) for k,h in hashes.items()):
                raise ManagerError('Interrupted save plus external changes detected. Preserve .rule_manager and restore manually; no files overwritten.',409,'RECOVERY_CONFLICT')
            for rel,raw in before.items():
                if raw is None: self.safe_path(rel).unlink(missing_ok=True)
                else: atomic_bytes(self.safe_path(rel),raw)
            manifest['status']='rolled-back'
        manifest['recoveryAt']=timestamp();atomic_bytes(folder/'manifest.json',encoded_json(manifest));pending.unlink()
        return {'backupId':key,'status':manifest['status']}

    def commit(self,payload):
        with self.lock:
            draft=self.get_draft(payload.get('draftId'))
            if draft.get('simple') and not draft.get('capabilityChecksConfirmed'):
                raise ManagerError('Run the wizard interpretation checks before saving.',422,'CHECKS_REQUIRED')
            if payload.get('revision')!=draft['base']:
                raise ManagerError('Draft revision mismatch.',409,'REVISION_CONFLICT')
            key=self.write_transaction(draft['blobs'],draft['base'],payload.get('note','Browser rule edit'))
            self.drafts.clear()
            return {'ok':True,'backupId':key,**self.read_snapshot()}

    def list_backups(self):
        with self.lock:
            return self._list_backups()

    def _list_backups(self):
        out=[]
        for p in sorted((self.store/'backups').glob('*/manifest.json'),reverse=True)[:50]:
            if p.is_symlink(): continue
            m=json.loads(p.read_text('utf-8'))
            out.append({k:m.get(k) for k in ('id','createdAt','note','status','beforeRevision','afterRevision')})
        return out

    def restore(self,payload):
        with self.lock:
            self.check_code();snap=self.read_snapshot()
            if payload.get('revision')!=snap['revision']: raise ManagerError('Reload before restoring.',409,'REVISION_CONFLICT')
            _,before=self.load_before(payload.get('backupId'))
            generated,_,_=self.compile_blobs(before)
            key=self.write_transaction({**before,'command_patterns.txt':generated},snap['revision'],'Restore sources from before '+payload['backupId'])
            self.drafts.clear()
            return {'ok':True,'backupId':key,**self.read_snapshot()}


class LocalServer(ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=False
    request_queue_size=10
    def get_request(self):
        sock,addr=super().get_request();sock.settimeout(15);return sock,addr


class Handler(BaseHTTPRequestHandler):
    server_version='RwaLocalWorkbench'
    sys_version=''
    def log_message(self,fmt,*args):
        pass  # no question content, tokens, IDs or request URLs in server logs

    @property
    def wb(self): return self.server.workbench

    def reply(self,status,data,mime='application/json; charset=utf-8',filename=None):
        raw=encoded_json(data) if isinstance(data,(dict,list)) else data.encode('utf-8') if isinstance(data,str) else data
        self.send_response(status)
        for k,v in {'Content-Type':mime,'Content-Length':str(len(raw)), 'Cache-Control':'no-store',
                    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
                    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
                    'Cross-Origin-Resource-Policy':'same-origin'}.items(): self.send_header(k,v)
        if filename: self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
        self.end_headers()
        if self.command!='HEAD': self.wfile.write(raw)

    def guard(self,mutation=False,api=False):
        port=self.server.server_port
        hosts=(f'127.0.0.1:{port}',f'localhost:{port}')
        values=self.headers.get_all('Host',[])
        if len(values)!=1 or values[0] not in hosts: raise ManagerError('Host not allowed.',403,'HOST_DENIED')
        if self.client_address[0]!='127.0.0.1': raise ManagerError('Loopback only.',403,'ADDRESS_DENIED')
        origin=self.headers.get('Origin');expected='http://'+values[0]
        if origin is not None and origin!=expected: raise ManagerError('Cross-origin request rejected.',403,'ORIGIN_DENIED')
        if self.headers.get('Sec-Fetch-Site') in ('cross-site','same-site'): raise ManagerError('Cross-site request rejected.',403,'FETCH_DENIED')
        if mutation and origin!=expected: raise ManagerError('Same-origin Origin header is required.',403,'ORIGIN_REQUIRED')
        if api or mutation:
            supplied=self.headers.get('X-RWA-CSRF','')
            if not secrets.compare_digest(supplied,self.wb.token): raise ManagerError('Refresh the page to obtain a valid session token.',403,'TOKEN_DENIED')
        if self.headers.get('Transfer-Encoding'): raise ManagerError('Transfer encoding not supported.',400)

    def run_handler(self,callback):
        try: callback()
        except ManagerError as e:
            self.reply(e.status,{'ok':False,'code':e.code,'message':str(e),**e.details})
        except subprocess.TimeoutExpired:
            self.reply(408,{'ok':False,'code':'COMPILER_TIMEOUT','message':'Compiler exceeded 30 seconds; source files were not committed.'})
        except (BrokenPipeError,ConnectionResetError,TimeoutError): pass
        except Exception as e:
            print('Local manager error: '+type(e).__name__,file=sys.stderr)
            self.reply(500,{'ok':False,'code':'LOCAL_ERROR','message':'Local operation failed. Check folder permissions/free disk space. Preserve .rule_manager if recovery is needed.'})

    def do_GET(self): self.run_handler(self.get)
    def do_POST(self): self.run_handler(self.post)
    def do_OPTIONS(self): self.reply(405,{'ok':False,'message':'Cross-origin API access is disabled.'})

    def get(self):
        self.guard()
        parsed=urlsplit(self.path)
        if parsed.query: raise ManagerError('Query-string routes are not supported.',404)
        path=parsed.path
        if path=='/api/bootstrap': self.reply(200,self.wb.bootstrap());return
        if path.startswith('/api/'):
            self.guard(api=True)
            if path=='/api/snapshot': self.reply(200,self.wb.read_snapshot());return
            if path=='/api/test-assets': self.reply(200,self.wb.test_assets);return
            if path=='/api/backups': self.reply(200,{'backups':self.wb.list_backups()});return
            if path=='/api/capabilities': self.reply(200,self.wb.capabilities.list());return
            if path=='/api/download':
                with self.wb.lock:
                    raw=self.wb.read_bytes_map()['command_patterns.txt']
                if raw is None: raise ManagerError('No compiled artifact. Validate and save first.',404)
                self.reply(200,raw,'text/plain; charset=utf-8','command_patterns.txt');return
            raise ManagerError('Unknown API endpoint.',404)
        if path in self.wb.runtime:
            self.reply(200,self.wb.runtime[path],'text/javascript; charset=utf-8');return
        assets={'/':'index.html','/index.html':'index.html','/advanced':'advanced.html','/advanced.html':'advanced.html','/manager.js':'manager.js','/manager.css':'manager.css','/test_lab.js':'test_lab.js',
                '/simple.js':'simple.js','/simple.css':'simple.css','/simple_logic.js':'simple_logic.js'}
        if path in assets:
            fp=APP_DIR/assets[path]
            mime='text/html' if fp.suffix=='.html' else 'text/css' if fp.suffix=='.css' else 'text/javascript'
            self.reply(200,fp.read_bytes(),mime+'; charset=utf-8');return
        if path=='/favicon.ico': self.reply(204,b'','image/x-icon');return
        raise ManagerError('Not found. This server does not expose arbitrary project files.',404,'NOT_FOUND')

    def post(self):
        self.guard(mutation=True)
        if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':
            raise ManagerError('Use application/json.',415,'CONTENT_TYPE')
        lengths=self.headers.get_all('Content-Length',[])
        if len(lengths)!=1 or not lengths[0].isdigit(): raise ManagerError('Content-Length required.',411)
        length=int(lengths[0])
        if length>MAX_BODY: raise ManagerError('Request exceeds 12 MB.',413)
        raw=self.rfile.read(length)
        if len(raw)!=length: raise ManagerError('Incomplete request body.')
        try: payload=json.loads(raw,parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
        except (ValueError,UnicodeError): raise ManagerError('Invalid JSON body.')
        if not isinstance(payload,dict): raise ManagerError('JSON object required.')
        if self.path=='/api/capabilities/prepare': result=self.wb.capabilities.prepare(payload)
        elif self.path=='/api/capabilities/commit': result=self.wb.capabilities.commit(payload)
        elif self.path=='/api/validate': result=self.wb.validate(payload)
        elif self.path=='/api/commit': result=self.wb.commit(payload)
        elif self.path=='/api/restore': result=self.wb.restore(payload)
        elif self.path=='/api/import':
            text=payload.get('text')
            if not isinstance(text,str): raise ManagerError('CSV text required.')
            result={'ok':True,'table':self.wb.parse_csv(payload.get('file'),text)}
        else: raise ManagerError('Unknown API endpoint.',404)
        self.reply(200,result)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--project',type=Path,default=Path(__file__).resolve().parent)
    ap.add_argument('--port',type=int,default=8765)
    ap.add_argument('--no-open',action='store_true')
    args=ap.parse_args()
    if not 1024<=args.port<=65535: ap.error('Use a port from 1024 to 65535.')
    wb=server=None
    try:
        wb=Workbench(args.project)
        server=LocalServer(('127.0.0.1',args.port),Handler);server.workbench=wb
        url=f'http://127.0.0.1:{server.server_port}/'
        print(f'RWA Rule Workbench {VERSION}\nProject: {wb.root}\nOpen: {url}\nLocal-only authoring tool. Ctrl+C stops the server. No live Tableau connection.',flush=True)
        if not args.no_open: webbrowser.open(url,new=2)
        server.serve_forever(poll_interval=.4)
    except KeyboardInterrupt: print('\nStopped.')
    except (ManagerError,OSError) as e:
        print('ERROR: '+str(e)+'\nCheck the full project folder or select --port 8766.',file=sys.stderr)
        return 1
    finally:
        if server: server.server_close()
        if wb: wb.close()
    return 0

if __name__=='__main__': raise SystemExit(main())
