"""Development regression tests; no live bank system or independent security certification."""
from __future__ import annotations
import copy
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import threading
import http.client
import json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import rule_manager as rm
ROOT=Path(__file__).resolve().parents[1]

def fixture(root):
    for p in ['build_command_patterns.py','rule_parser.js','rwa_engine.js','csv_adapter.js','group_catalog.js',
              'tableau_adapter.js','network.js','driver_catalog.js','historical_peaks.js','command_patterns.txt','tableau_sample.csv','rwa_sample_data.txt','rules_config.txt']:
        shutil.copy2(ROOT/p,root/p)
    for p in ['rules','tools','semantic']: shutil.copytree(ROOT/p,root/p,ignore=shutil.ignore_patterns('__pycache__'))

class TestManager(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);fixture(self.root);self.w=rm.Workbench(self.root)
    def tearDown(self): self.w.close();self.tmp.cleanup()
    def snap(self): return self.w.read_snapshot()
    def payload(self):
        s=self.snap();return {'revision':s['revision'],'tables':copy.deepcopy(s['tables'])}
    def add(self,p,phrase='take me through these movements'):
        p['tables']['synonyms.csv']['rows'].append({'concept':'ROOT','phrase':phrase,'weight':'1','enabled':'true','notes':'Local test'})
        return p
    def test_schema_loaded_from_original(self):
        b=self.w.bootstrap();self.assertEqual(7,len(b['tables']));self.assertTrue(b['artifactConsistent']);self.assertEqual(b['choices']['concepts'],sorted(self.w.schema.CONCEPTS))
    def test_valid_compile_does_not_write(self):
        old=self.snap()['revision'];d=self.w.validate(self.add(self.payload()));self.assertEqual(old,self.snap()['revision']);self.assertIn('take me through these movements',d['generatedText'])
    def test_save_writes_source_and_artifact_with_backup(self):
        p=self.add(self.payload());d=self.w.validate(p);r=self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
        self.assertTrue(r['artifactConsistent']);self.assertNotEqual(r['revision'],p['revision']);self.assertEqual(1,r['backupCount']);self.assertIn('take me through these movements',(self.root/'rules/synonyms.csv').read_text());self.assertEqual('committed',self.w.list_backups()[0]['status'])
    def test_restore_recompiles_old_source_and_backs_up_current(self):
        original=self.snap();p=self.add(self.payload());d=self.w.validate(p);saved=self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
        restored=self.w.restore({'backupId':saved['backupId'],'revision':saved['revision']})
        self.assertEqual(original['tables'],restored['tables']);self.assertTrue(restored['artifactConsistent']);self.assertEqual(2,restored['backupCount'])
    def test_conflicting_synonym_aborts(self):
        p=self.payload();r=copy.deepcopy(p['tables']['synonyms.csv']['rows'][0]);r['concept']='INCREASE' if r['concept']!='INCREASE' else 'DECREASE';p['tables']['synonyms.csv']['rows'].append(r)
        with self.assertRaises(rm.ManagerError) as e:self.w.validate(p)
        self.assertEqual(422,e.exception.status);self.assertEqual(p['revision'],self.snap()['revision']);self.assertEqual([],self.w.list_backups())
    def test_delete_required_rule_field_aborts(self):
        p=self.payload();p['tables']['commands.csv']['rows'][0]['action']=''
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_customer_alias_table_cannot_be_added(self):
        p=self.payload();p['tables']['aliases.csv']={'headers':[],'rows':[]}
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_unknown_concept_rejected(self):
        p=self.add(self.payload());p['tables']['synonyms.csv']['rows'][-1]['concept']='NEURAL_UNKNOWN'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_unsafe_fuzzy_rejected(self):
        p=self.payload();p['tables']['fuzzy_config.csv']['rows'][0]['threshold']='0.1'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_invalid_followup_rejected(self):
        p=self.payload();p['tables']['followups.csv']['rows'][0]['pattern']='how about {invented_slot}'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_invalid_unit_rejected(self):
        p=self.payload();p['tables']['units.csv']['rows'][0]['multiplier']='-2'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_invalid_temporal_rejected(self):
        p=self.payload();p['tables']['temporal.csv']['rows'][0]['value']='13'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_disable_edit_delete_supported(self):
        p=self.payload();rows=p['tables']['synonyms.csv']['rows'];rows[-1]['enabled']='false';rows[-2]['notes']='Edited';rows.pop(-3)
        d=self.w.validate(p);self.assertEqual(['synonyms.csv'],[c['file'] for c in d['changes']])
    def test_stale_validation_rejected(self):
        p=self.payload();(self.root/'rules/synonyms.csv').write_bytes((self.root/'rules/synonyms.csv').read_bytes()+b'\n')
        with self.assertRaises(rm.ManagerError) as e:self.w.validate(p)
        self.assertEqual(409,e.exception.status)
    def test_stale_save_rejected(self):
        p=self.add(self.payload());d=self.w.validate(p);f=self.root/'rules/synonyms.csv';f.write_bytes(f.read_bytes()+b'\n');expected=f.read_bytes()
        with self.assertRaises(rm.ManagerError) as e:self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
        self.assertEqual(409,e.exception.status);self.assertEqual(expected,f.read_bytes())
    def test_engine_change_requires_restart(self):
        p=self.payload();f=self.root/'semantic/engine.js';f.write_text(f.read_text()+'\n')
        with self.assertRaises(rm.ManagerError) as e:self.w.validate(p)
        self.assertEqual('SOURCE_CHANGED',e.exception.code)
    def test_expired_draft_cannot_save(self):
        p=self.payload();d=self.w.validate(p);self.w.drafts[d['draftId']]['created']=0
        with self.assertRaises(rm.ManagerError):self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
    def test_multifile_save_error_rolls_back(self):
        old=self.snap()['revision'];p=self.add(self.payload());d=self.w.validate(p);real=rm.atomic_bytes;raised=False
        def fail_artifact(path,data):
            nonlocal raised
            if path==self.root/'command_patterns.txt' and not raised:raised=True;raise OSError('Injected write failure')
            return real(path,data)
        with patch.object(rm,'atomic_bytes',fail_artifact):
            with self.assertRaises(OSError):self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
        self.assertTrue(raised);self.assertEqual(old,self.snap()['revision']);self.assertFalse((self.root/'.rule_manager/pending.json').exists());self.assertEqual('rolled-back',self.w.list_backups()[0]['status'])
    def test_backup_corruption_rejected(self):
        p=self.add(self.payload());d=self.w.validate(p);r=self.w.commit({'draftId':d['draftId'],'revision':p['revision']})
        fp=self.root/'.rule_manager/backups'/r['backupId']/'before/rules/synonyms.csv';fp.write_bytes(b'corrupt')
        with self.assertRaises(rm.ManagerError) as e:self.w.restore({'backupId':r['backupId'],'revision':r['revision']})
        self.assertEqual('BACKUP_INTEGRITY',e.exception.code)
    def test_second_manager_denied(self):
        with self.assertRaises(rm.ManagerError):rm.Workbench(self.root)
    def test_customer_source_is_not_managed(self):
        self.assertNotIn('aliases.csv',self.w.headers)
        self.assertNotIn('rwa_sample_data.txt',self.w.test_assets)
        self.assertIn('/engine/driver_catalog.js',self.w.runtime)
        with self.assertRaises(rm.ManagerError):self.w.parse_csv('aliases.csv','kind,alias\nGROUP,Example\n')
    def test_import_unknown_filename_denied(self):
        with self.assertRaises(rm.ManagerError):self.w.parse_csv('../x.csv','x')
    def test_formula_cell_rejected(self):
        p=self.add(self.payload());p['tables']['synonyms.csv']['rows'][-1]['notes']='=WEBSERVICE("bad")'
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_malformed_csv_rejected(self):
        with self.assertRaises(rm.ManagerError):self.w.parse_csv('synonyms.csv','wrong,header\n1,2\n')
    def test_unknown_table_field_rejected(self):
        p=self.payload();p['tables']['evil.csv']={'headers':[],'rows':[]}
        with self.assertRaises(rm.ManagerError):self.w.validate(p)
    def test_noop_preserves_source_bytes(self):
        old=self.w.read_bytes_map();d=self.w.validate(self.payload());self.assertEqual(old,self.w.drafts[d['draftId']]['blobs'])
    def test_backup_id_traversal_denied(self):
        with self.assertRaises(rm.ManagerError):self.w.load_before('../rules')
    def test_symlink_rule_refused(self):
        if sys.platform=='win32':self.skipTest('POSIX symlink test')
        f=self.root/'rules/synonyms.csv';f.unlink();f.symlink_to(ROOT/'rules/synonyms.csv')
        with self.assertRaises(rm.ManagerError):self.w.read_snapshot()

class TestHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.root=Path(cls.tmp.name);fixture(cls.root);cls.w=rm.Workbench(cls.root)
        cls.server=rm.LocalServer(('127.0.0.1',0),rm.Handler);cls.server.workbench=cls.w
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.port=cls.server.server_port
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.w.close();cls.tmp.cleanup()
    def request(self,path,method='GET',data=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=10)
        body=json.dumps(data) if data is not None else None
        h={'Host':f'127.0.0.1:{self.port}','X-RWA-CSRF':self.w.token}
        if method=='POST':h.update({'Content-Type':'application/json','Origin':f'http://127.0.0.1:{self.port}'})
        h.update(headers or {});c.request(method,path,body,h);r=c.getresponse();raw=r.read();result=r.status,dict(r.getheaders()),raw;c.close();return result
    def test_ui_and_modules(self):
        for path in ['/','/manager.js','/manager.css','/test_lab.js','/engine/rwa_engine.js','/engine/semantic/engine.js']:
            with self.subTest(path=path):self.assertEqual(200,self.request(path)[0])
    def test_bootstrap(self):self.assertEqual(7,len(json.loads(self.request('/api/bootstrap')[2])['tables']))
    def test_host_rejected(self):self.assertEqual(403,self.request('/api/bootstrap',headers={'Host':'attacker.invalid'})[0])
    def test_cross_origin_write_rejected(self):self.assertEqual(403,self.request('/api/validate','POST',{},headers={'Origin':'https://attacker.invalid'})[0])
    def test_missing_token_write_rejected(self):self.assertEqual(403,self.request('/api/validate','POST',{},headers={'X-RWA-CSRF':''})[0])
    def test_null_origin_rejected(self):self.assertEqual(403,self.request('/api/validate','POST',{},headers={'Origin':'null'})[0])
    def test_no_get_mutation(self):self.assertEqual(404,self.request('/api/commit')[0])
    def test_no_serve_arbitrary_files(self):
        for p in ['/rules/aliases.csv','/.rule_manager/manager.lock','/engine/../rule_manager.py','/api/backups/../../x','/tableau_config.txt','/demo.html']:
            with self.subTest(path=p):self.assertEqual(404,self.request(p)[0])
    def test_simple_content_type_denied(self):self.assertEqual(415,self.request('/api/validate','POST',{},headers={'Content-Type':'text/plain'})[0])
    def test_cross_site_read_denied(self):self.assertEqual(403,self.request('/api/bootstrap',headers={'Sec-Fetch-Site':'cross-site'})[0])
    def test_csp_no_cors_and_no_cache(self):
        status,headers,_=self.request('/');self.assertEqual(200,status);self.assertIn("script-src 'self'",headers['Content-Security-Policy']);self.assertNotIn('Access-Control-Allow-Origin',headers);self.assertEqual('no-store',headers['Cache-Control'])
    def test_valid_http_compile(self):
        s=self.w.read_snapshot();status,_,raw=self.request('/api/validate','POST',{'revision':s['revision'],'tables':s['tables']});self.assertEqual(200,status);self.assertTrue(json.loads(raw)['ok'])

if __name__=='__main__':unittest.main(verbosity=2)
