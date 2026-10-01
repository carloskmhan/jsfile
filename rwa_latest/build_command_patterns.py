#!/usr/bin/env python3
"""Compile manually specified CSV rules; no fitting, training, data-driven weights, or network access.

Usage: python build_command_patterns.py [--rules-dir rules] [--out command_patterns.txt] [--check]
UTF-8 (BOM accepted). Standard library only. A failed build leaves the previous artifact untouched.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, math, os, re, sys, tempfile, unicodedata
from pathlib import Path
from tools.rule_schema import (ENGINE_VERSION, ACTIONS, CONCEPTS, SLOTS, TEMPLATE_SLOTS, PATCHES, HEADERS, SETTINGS)

HEADER = '# AUTO-GENERATED FILE\n# DO NOT EDIT DIRECTLY\n# Source: rules/*.csv\n# Run: python build_command_patterns.py\n'
class BuildError(ValueError): pass

def normal(s: str) -> str:
    s=unicodedata.normalize('NFKC',s).lower().translate(str.maketrans({'’':"'",'‘':"'",'–':'-','—':'-','−':'-'}))
    s=re.sub(r"\b(was|is|did|were|does|do|has|have|had|could|would|should)n['’]t\b",r'\1 not',s)
    s=re.sub(r"\bcan['’]t\b",'can not',s)
    s=re.sub(r"(\w)'s\b",r'\1',s)
    return re.sub(r'\s+',' ',s).strip()

def fail(file: str, line: int, msg: str):
    raise BuildError(f'{file} line {line}: {msg}')

def boolean(value: str, file: str, line: int) -> bool:
    if value not in ('true','false','1','0'): fail(file,line,'enabled must be true/false (or 1/0).')
    return value in ('true','1')

def number(s: str, file: str, line: int, key: str, lo: float, hi: float) -> float:
    try: n=float(s)
    except (ValueError,TypeError): fail(file,line,f'{key}: invalid number {s!r}.')
    if not math.isfinite(n) or not lo<=n<=hi: fail(file,line,f'{key} must be finite and in [{lo}, {hi}].')
    return n

def parts(s: str) -> list[str]: return [x.strip() for x in s.split('|') if x.strip()]

def read_rows(root: Path, filename: str):
    path=root/filename
    if not path.is_file(): raise BuildError(f'Missing required file: {path}')
    if path.stat().st_size>4_000_000: raise BuildError(f'{filename}: exceeds 4 MB limit.')
    try:
        with path.open(encoding='utf-8-sig',newline='') as f:
            reader=csv.DictReader(f,strict=True)
            if reader.fieldnames!=HEADERS[filename]: raise BuildError(f'{filename}: expected header: '+','.join(HEADERS[filename]))
            for row in reader:
                line=reader.line_num
                if None in row or any(v is None for v in row.values()): fail(filename,line,'CSV column count mismatch; quote cells containing commas.')
                row={k:v.strip() for k,v in row.items()}
                if not any(row.values()): continue
                if any('\x00' in v for v in row.values()): fail(filename,line,'NUL characters are not allowed.')
                for k,v in row.items():
                    if k!='notes' and v.startswith(('=','+','@')): fail(filename,line,f'{k}: formula-like CSV value is not allowed.')
                yield line,row
    except (UnicodeError,csv.Error) as e: raise BuildError(f'{filename}: invalid UTF-8/CSV: {e}') from e

def compile_rules(root: Path) -> dict:
    commands=[];ids=set()
    for line,r in read_rows(root,'commands.csv'):
        f='commands.csv'
        for k in ['command_id','intent','action','response_template','scope','primary_features','required_slots']:
            if not r[k]: fail(f,line,f'missing required field {k}.')
        if not re.fullmatch(r'[A-Z][A-Z0-9_]{1,63}',r['command_id']): fail(f,line,'invalid command_id.')
        if r['command_id'] in ids: fail(f,line,'duplicate command ID '+r['command_id'])
        ids.add(r['command_id'])
        if r['action'] not in ACTIONS or r['response_template']!=r['action']: fail(f,line,'unknown action/response_template; template must name the existing executor.')
        if r['scope'] not in ('ANY','GROUP','ENTITY','PORTFOLIO'): fail(f,line,'scope must be ANY, GROUP, ENTITY or PORTFOLIO.')
        for k in ['primary_features','supporting_features','contradiction_features']:
            r[k]=parts(r[k]);unknown=set(r[k])-CONCEPTS
            if unknown: fail(f,line,f'{k}: unknown concept(s) '+', '.join(sorted(unknown)))
            if len(r[k])!=len(set(r[k])): fail(f,line,f'duplicate feature in {k}.')
        if set(r['primary_features']) & set(r['contradiction_features']): fail(f,line,'primary and contradictory features overlap.')
        for k in ['required_slots','optional_slots','forbidden_slots']:
            r[k]=parts(r[k]);unknown=set(r[k])-SLOTS
            if unknown: fail(f,line,f'{k}: unknown slot(s) '+', '.join(sorted(unknown)))
        if set(r['required_slots']) & (set(r['optional_slots'])|set(r['forbidden_slots'])) or set(r['optional_slots']) & set(r['forbidden_slots']): fail(f,line,'required/optional/forbidden slots overlap.')
        for k in ['intent_weight','metric_weight','scope_weight','subject_weight','period_weight','modifier_weight']: r[k]=number(r[k],f,line,k,0,1000)
        if r['intent_weight']<=0: fail(f,line,'intent_weight must be greater than zero.')
        r['contradiction_weight']=number(r['contradiction_weight'],f,line,'contradiction_weight',-1000,-1)
        for k in ('min_confidence','min_margin'): r[k]=number(r[k],f,line,k,0,1)
        r['enabled']=boolean(r['enabled'],f,line);r['source']={'file':f,'line':line};commands.append(r)
    if not commands or not any(c['enabled'] for c in commands): raise BuildError('commands.csv: at least one enabled command is required.')
    enabled_ids={c['command_id'] for c in commands if c['enabled']}
    synonyms=[];phrases={}
    for line,r in read_rows(root,'synonyms.csv'):
        f='synonyms.csv';r['enabled']=boolean(r['enabled'],f,line);r['phrase']=normal(r['phrase'])
        if r['concept'] not in CONCEPTS: fail(f,line,'unknown concept '+r['concept'])
        if not r['phrase'] or len(r['phrase'])>160: fail(f,line,'phrase must have 1–160 characters.')
        if any(c in r['phrase'] for c in '{}[]\\^$*+|()'): fail(f,line,'regex expressions are not supported in phrases; enter a literal phrase.')
        r['weight']=number(r['weight'],f,line,'weight',0.01,1)
        if r['enabled']:
            if r['phrase'] in phrases:
                old=phrases[r['phrase']];fail(f,line,f'phrase {r["phrase"]!r} is duplicated/conflicting with {old[0]} at line {old[1]}; current concept {r["concept"]}.')
            phrases[r['phrase']]=(r['concept'],line)
        r['source']={'file':f,'line':line};synonyms.append(r)
    # Customers are NOT compiled into the shared language artifact.
    # A legacy populated alias CSV is rejected rather than silently published or ignored.
    legacy=root/'aliases.csv'
    if legacy.exists():
        with legacy.open(encoding='utf-8-sig',newline='') as f:
            reader=csv.reader(f);next(reader,None)
            if any(any(v.strip() for v in row) for row in reader):
                raise BuildError('aliases.csv: customer identities now come from the authenticated Tableau index. Back up this legacy file outside the web release and remove it before compiling. Do not publish customer names in command_patterns.txt.')
    aliases=[]
    followups=[];fids=set();patterns={}
    for line,r in read_rows(root,'followups.csv'):
        f='followups.csv';r['enabled']=boolean(r['enabled'],f,line)
        if not r['rule_id'] or r['rule_id'] in fids: fail(f,line,'missing/duplicate follow-up rule_id.')
        fids.add(r['rule_id'])
        if r['patch_type'] not in PATCHES: fail(f,line,'unknown patch_type '+r['patch_type'])
        if r['target_slot'] and r['target_slot'] not in SLOTS: fail(f,line,'unknown target_slot '+r['target_slot'])
        if r['command_id'] and r['command_id'] not in enabled_ids: fail(f,line,'broken command reference '+r['command_id'])
        if r['patch_type']=='CHANGE_COMMAND' and not r['command_id']: fail(f,line,'CHANGE_COMMAND needs command_id.')
        r['pattern']=normal(r['pattern']);captures=re.findall(r'\{([^{}]+)\}',r['pattern'])
        if len(captures)!=len(set(captures)): fail(f,line,'duplicate follow-up slot; use other_scope for the second subject.')
        if set(captures)-TEMPLATE_SLOTS: fail(f,line,'unknown follow-up slot(s): '+', '.join(sorted(set(captures)-TEMPLATE_SLOTS)))
        literal=re.sub(r'\{[^{}]+\}','',r['pattern'])
        if not r['pattern'] or len(r['pattern'])>250 or any(c in literal for c in '{}[]\\^$*+|()'): fail(f,line,'invalid follow-up pattern/regex: only literal words and approved {slots} are allowed.')
        try: re.compile('^'+re.escape(r['pattern'])+'$')
        except re.error as e: fail(f,line,'invalid generated regex: '+str(e))
        if r['enabled'] and r['pattern'] in patterns: fail(f,line,'duplicate/conflicting follow-up pattern, previous line '+str(patterns[r['pattern']]))
        patterns[r['pattern']]=line
        required_capture={'REPLACE_SCOPE':'scope','REPLACE_PERIOD':'period','SET_DRIVER':'driver','ADD_FILTER':'threshold','COMPARE_SCOPE':'scope','COMPARE_REFERENCE':'rankref','FOCUS_REFERENCE':'rankref','SET_LIMIT':'n'}.get(r['patch_type'])
        if required_capture and required_capture not in captures: fail(f,line,'patch needs {'+required_capture+'}.')
        r['source']={'file':f,'line':line};followups.append(r)
    settings={k:v[1] for k,v in SETTINGS.items()};sseen=set()
    for line,r in read_rows(root,'settings.csv'):
        f='settings.csv';key=r['key']
        if key not in SETTINGS: fail(f,line,'unknown setting '+key)
        if key in sseen: fail(f,line,'duplicate setting '+key)
        sseen.add(key);spec=SETTINGS[key]
        if spec[0]=='policy':
            if r['value'] not in spec[2]: fail(f,line,'invalid inheritance policy for '+key)
            settings[key]=r['value']
        else:
            n=number(r['value'],f,line,key,spec[2],spec[3])
            if spec[0] is int and n!=int(n): fail(f,line,key+' must be an integer.')
            settings[key]=spec[0](n)
    if settings['default_top_n']>settings['max_top_n']: raise BuildError('settings.csv: default_top_n exceeds max_top_n.')
    if settings['default_window_months']>settings['max_window_months']: raise BuildError('settings.csv: default window exceeds maximum.')
    limits=[('commands',commands,100),('synonyms',synonyms,3000),('aliases',aliases,10000),('followups',followups,1000)]
    for name,items,limit in limits:
        if len(items)>limit: raise BuildError(f'{name}: exceeds {limit} entries.')
    from tools.compiler_extensions import validate_extensions
    extension=validate_extensions(root,read_rows,boolean,number,normal,fail,commands,synonyms)
    from tools.composition_rules import compile_composition
    try:
        composition, extra_hashes = compile_composition(root, synonyms)
    except (ValueError, csv.Error, UnicodeError) as e:
        raise BuildError(str(e)) from e
    extension.update(composition)
    hashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in HEADERS}
    hashes.update(extra_hashes)
    return {'identitySource':'runtime_catalog','schemaVersion':5,'version':ENGINE_VERSION,'generated':True,'scoreMeaning':'manually weighted rule-fit, not a probability',
            'sourceSha256':hashes,'knownConcepts':sorted(CONCEPTS),'knownSlots':sorted(SLOTS),
            'commands':commands,'synonyms':synonyms,'aliases':aliases,'followups':followups,'settings':settings,**extension}

def atomic_write(path: Path, text: str):
    path.parent.mkdir(parents=True,exist_ok=True);name=None
    try:
        with tempfile.NamedTemporaryFile('w',encoding='utf-8',newline='\n',dir=path.parent,prefix='.'+path.name+'.',suffix='.tmp',delete=False) as f:
            name=f.name;f.write(text);f.flush();os.fsync(f.fileno())
        if path.exists(): os.chmod(name,path.stat().st_mode & 0o777)
        else: os.chmod(name,0o644)
        os.replace(name,path);name=None
        if hasattr(os,'O_DIRECTORY'):
            fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
    finally:
        if name: Path(name).unlink(missing_ok=True)

def main() -> int:
    root=Path(__file__).resolve().parent
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--rules-dir',type=Path,default=root/'rules');p.add_argument('--out',type=Path,default=root/'command_patterns.txt');p.add_argument('--check',action='store_true');a=p.parse_args()
    try:
        model=compile_rules(a.rules_dir)
        if a.out.resolve().parent==a.rules_dir.resolve() or a.out.resolve() in [(a.rules_dir/n).resolve() for n in HEADERS]: raise BuildError('Output must not overwrite rule source files.')
        text=HEADER+json.dumps(model,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
        if not a.check: atomic_write(a.out,text)
        print(('VALIDATED' if a.check else 'BUILT')+f": {len(model['commands'])} commands, {len(model['synonyms'])} synonyms, {len(model['aliases'])} aliases, {len(model['followups'])} follow-ups.")
        if not a.check: print(str(a.out)+'\nSHA256 '+hashlib.sha256(text.encode()).hexdigest())
        return 0
    except (BuildError,OSError) as e:
        print('ERROR:\n'+str(e)+'\nBuild aborted. Existing command_patterns.txt was not replaced.',file=sys.stderr);return 1
if __name__=='__main__': raise SystemExit(main())
