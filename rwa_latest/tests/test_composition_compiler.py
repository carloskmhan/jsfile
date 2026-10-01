"""Optional extension validation and manager preservation; standard library only."""
from pathlib import Path
import copy, csv, hashlib, json, shutil, subprocess, sys, tempfile, unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from build_command_patterns import compile_rules, BuildError, HEADER
from rule_manager import Workbench, ManagerError

class CompositionCompiler(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.rules=self.root/'rules';shutil.copytree(ROOT/'rules',self.rules)
    def tearDown(self):self.temp.cleanup()
    def edit(self,name,fn):
        p=self.rules/name
        with p.open(newline='') as f:r=csv.DictReader(f);header=r.fieldnames;rows=list(r)
        fn(rows)
        with p.open('w',newline='') as f:w=csv.DictWriter(f,fieldnames=header,lineterminator='\n');w.writeheader();w.writerows(rows)
    def test_extension_compiles(self):
        r=compile_rules(self.rules);self.assertEqual(r['schemaVersion'],5);self.assertEqual(r['composition']['schemaVersion'],1)
        self.assertEqual(r['aliases'],[]);self.assertIn('lexical_families.csv',r['sourceSha256'])
    def test_absence_is_byte_identical_legacy(self):
        for n in ['lexical_families.csv','composition_rules.csv']:(self.rules/n).unlink()
        r=compile_rules(self.rules);self.assertNotIn('composition',r)
        text=HEADER+json.dumps(r,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
        self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),'57cfb8ca25df30f1121224b767d2a0508c0d5248b2615f459d33087ddd585cb7')
    def test_half_pair_rejected(self):
        (self.rules/'composition_rules.csv').unlink()
        with self.assertRaisesRegex(BuildError,'pair'):compile_rules(self.rules)
    def test_unknown_family(self):
        self.edit('lexical_families.csv',lambda r:r[0].update(family_id='LEARN'))
        with self.assertRaises(BuildError):compile_rules(self.rules)
    def test_protected_qualifier(self):
        self.edit('lexical_families.csv',lambda r:r[0].update(phrase='not'))
        with self.assertRaisesRegex(BuildError,'protected'):compile_rules(self.rules)
    def test_identifier_not_language(self):
        self.edit('lexical_families.csv',lambda r:r[0].update(phrase='cg0001'))
        with self.assertRaises(BuildError):compile_rules(self.rules)
    def test_regex_rejected(self):
        self.edit('lexical_families.csv',lambda r:r[0].update(phrase='grow.*'))
        with self.assertRaises(BuildError):compile_rules(self.rules)
    def test_synonym_conflict(self):
        self.edit('lexical_families.csv',lambda r:r[0].update(phrase='decrease'))
        with self.assertRaisesRegex(BuildError,'conflicts'):compile_rules(self.rules)
    def test_duplicate_phrase(self):
        self.edit('lexical_families.csv',lambda r:r.append(dict(r[0])))
        with self.assertRaisesRegex(BuildError,'duplicate'):compile_rules(self.rules)
    def test_structural_link_cannot_be_redefined(self):
        self.edit('lexical_families.csv',lambda r:next(x for x in r if x['family_id']=='PATCH_LINK').update(phrase='ignore'))
        with self.assertRaisesRegex(BuildError,'structural'):compile_rules(self.rules)
    def test_shape_cannot_invent_executor(self):
        self.edit('composition_rules.csv',lambda r:r[0].update(shape='FORECAST'))
        with self.assertRaises(BuildError):compile_rules(self.rules)
    def test_duplicate_shape(self):
        self.edit('composition_rules.csv',lambda r:r.append({**r[0],'rule_id':'ANOTHER'}))
        with self.assertRaises(BuildError):compile_rules(self.rules)
    def test_source_hash_tracks_disabled_rules(self):
        before=compile_rules(self.rules)['sourceSha256']['lexical_families.csv']
        self.edit('lexical_families.csv',lambda r:r[0].update(enabled='false'))
        after=compile_rules(self.rules);self.assertNotEqual(before,after['sourceSha256']['lexical_families.csv'])
        self.assertFalse(after['composition']['lexicalFamilies'][0]['enabled'])
    def test_invalid_build_preserves_previous_artifact(self):
        self.edit('composition_rules.csv',lambda r:r[0].update(shape='GUESS'))
        out=self.root/'previous.txt';out.write_bytes(b'APPROVED')
        p=subprocess.run([sys.executable,str(ROOT/'build_command_patterns.py'),'--rules-dir',str(self.rules),'--out',str(out)],capture_output=True,text=True,timeout=30)
        self.assertNotEqual(p.returncode,0);self.assertEqual(out.read_bytes(),b'APPROVED')
    def test_pair_reproducible(self):
        self.assertEqual(compile_rules(self.rules),compile_rules(self.rules))
    def test_manager_roundtrip_preserves_optional_sources(self):
        project=self.root/'project';shutil.copytree(ROOT,project,ignore=shutil.ignore_patterns('.git','.rule_manager','reports','*_reports','__pycache__'))
        wb=Workbench(project)
        try:
            sources={n:(project/'rules'/n).read_bytes() for n in ['lexical_families.csv','composition_rules.csv']}
            snap=wb.read_snapshot();self.assertTrue(snap['artifactConsistent']);self.assertEqual(len(snap['tables']),7)
            tables=copy.deepcopy(snap['tables']);tables['synonyms.csv']['rows'].append({'concept':'ROOT','phrase':'clarify the drivers','weight':'1','enabled':'true','notes':'Round-trip test'})
            draft=wb.validate({'revision':snap['revision'],'tables':tables})
            saved=wb.commit({'draftId':draft['draftId'],'revision':snap['revision']})
            for n,raw in sources.items():self.assertEqual((project/'rules'/n).read_bytes(),raw)
            self.assertTrue(saved['artifactConsistent']);self.assertIn('composition',json.loads('\n'.join(x for x in saved['generatedText'].splitlines() if not x.startswith('#'))))
            restored=wb.restore({'backupId':saved['backupId'],'revision':saved['revision']})
            for n,raw in sources.items():self.assertEqual((project/'rules'/n).read_bytes(),raw)
            self.assertTrue(restored['artifactConsistent'])
        finally:wb.close()
    def test_manager_extension_change_invalidates_draft(self):
        project=self.root/'project';shutil.copytree(ROOT,project,ignore=shutil.ignore_patterns('.git','.rule_manager','reports','*_reports','__pycache__'))
        wb=Workbench(project)
        try:
            snap=wb.read_snapshot();draft=wb.validate({'revision':snap['revision'],'tables':snap['tables']})
            p=project/'rules/lexical_families.csv';p.write_text(p.read_text()+'\n')
            with self.assertRaises(ManagerError):wb.commit({'draftId':draft['draftId'],'revision':snap['revision']})
        finally:wb.close()

if __name__=='__main__':unittest.main(verbosity=2)
