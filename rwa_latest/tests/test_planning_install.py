"""Synthetic migration checks; existing Workbench transaction tests remain the recovery gate."""
from pathlib import Path
import csv, io, shutil, sys, tempfile, unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from install_semantic_planning import upgrade
from build_command_patterns import compile_rules,HEADER
import json
class PlanningInstall(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'project'
        shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('.git','.rule_manager','reports','*_reports','__pycache__'))
    def tearDown(self):self.temp.cleanup()
    def baseline(self):
        path=self.root/'rules/composition_rules.csv'
        path.write_text(''.join(line for line in path.read_text().splitlines(True) if not line.startswith('PLAN_')))
        r=compile_rules(self.root/'rules');(self.root/'command_patterns.txt').write_text(HEADER+json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    def test_additive_and_idempotent(self):
        self.baseline();before={p.name:p.read_bytes() for p in (self.root/'rules').glob('*.csv')}
        result=upgrade(self.root);self.assertTrue(result['changed']);self.assertEqual(len(result['addedShapes']),3);self.assertTrue(result['backupId'])
        for name,raw in before.items():
            if name!='composition_rules.csv':self.assertEqual((self.root/'rules'/name).read_bytes(),raw)
        self.assertTrue((self.root/'rules/composition_rules.csv').read_bytes().startswith(before['composition_rules.csv']))
        self.assertFalse(upgrade(self.root)['changed'])
    def test_disabled_shape_preserved(self):
        p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text().replace('RANKING_ROLES,true','RANKING_ROLES,false'))
        upgrade(self.root);self.assertIn('RANKING_ROLES,false',p.read_text());self.assertFalse(upgrade(self.root)['changed'])
    def test_existing_shape_custom_id_preserved(self):
        p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text().replace('PLAN_RANKING_ROLES,','MY_RANKING_RULE,'))
        upgrade(self.root);self.assertIn('MY_RANKING_RULE,',p.read_text());self.assertNotIn('PLAN_RANKING_ROLES,',p.read_text())
    def test_conflict_does_not_replace_any_rule_or_artifact(self):
        self.baseline();p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text()+'PLAN_RANKING_ROLES,ACCEPTED_AUDIT,true,Conflicting ID\n')
        paths=[*(self.root/'rules').glob('*.csv'),self.root/'command_patterns.txt'];before={p:p.read_bytes() for p in paths}
        with self.assertRaisesRegex(ValueError,'Conflicting'):upgrade(self.root)
        for p,raw in before.items():self.assertEqual(p.read_bytes(),raw)
    def test_compiler_failure_preserves_source(self):
        self.baseline();p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text()+'BAD_RULE,FORECAST,true,Unsupported\n')
        before=p.read_bytes();artifact=(self.root/'command_patterns.txt').read_bytes()
        with self.assertRaises(Exception):upgrade(self.root)
        self.assertEqual(p.read_bytes(),before);self.assertEqual((self.root/'command_patterns.txt').read_bytes(),artifact)
if __name__=='__main__':unittest.main(verbosity=2)
