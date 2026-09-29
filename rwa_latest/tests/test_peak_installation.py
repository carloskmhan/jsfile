"""Reviewed CSV migration tests; use disposable project copies only."""
from pathlib import Path
import sys,tempfile,shutil,unittest,copy,contextlib,io
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from rule_manager import Workbench,ManagerError
from install_historical_peak import upgrade,ACTION,COMMAND_ID
class InstallTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'project'
  shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('.rule_manager','__pycache__','reports','validation_history','simple_manager_reports'))
 def tearDown(self):self.tmp.cleanup()
 def run_upgrade(self):
  with contextlib.redirect_stdout(io.StringIO()):return upgrade(self.root)
 def files(self):return {str(p.relative_to(self.root)):p.read_bytes() for p in (self.root/'rules').glob('*.csv')}|{'command_patterns.txt':(self.root/'command_patterns.txt').read_bytes()}
 def test_first_install_from_original_csvs(self):
  baseline=ROOT/'tests/fixtures/pre_historical_peak'
  for f in (baseline/'rules').glob('*.csv'):shutil.copy2(f,self.root/'rules'/f.name)
  shutil.copy2(baseline/'command_patterns.txt',self.root/'command_patterns.txt')
  w=Workbench(self.root)
  try:before=w.read_snapshot()['tables'];self.assertFalse(any(r['action']==ACTION for r in before['commands.csv']['rows']))
  finally:w.close()
  self.run_upgrade();w=Workbench(self.root)
  try:
   after=w.read_snapshot();self.assertTrue(after['artifactConsistent']);self.assertEqual(1,len([r for r in after['tables']['commands.csv']['rows'] if r['action']==ACTION]))
   for old in before['commands.csv']['rows']:
    new=next(r for r in after['tables']['commands.csv']['rows'] if r['command_id']==old['command_id'])
    self.assertEqual({k:v for k,v in old.items() if k!='contradiction_features'},{k:v for k,v in new.items() if k!='contradiction_features'})
   self.assertEqual(before['synonyms.csv']['rows'],after['tables']['synonyms.csv']['rows'][:len(before['synonyms.csv']['rows'])])
  finally:w.close()
 def test_idempotent(self):
  self.run_upgrade();before=self.files();self.run_upgrade();self.assertEqual(before,self.files())
 def test_existing_non_feature_csvs_untouched(self):
  files=['settings.csv','followups.csv','units.csv','temporal.csv','fuzzy_config.csv'];before={f:(self.root/'rules'/f).read_bytes() for f in files};self.run_upgrade();self.assertEqual(before,{f:(self.root/'rules'/f).read_bytes() for f in files})
 def test_custom_expression_preserved(self):
  with (self.root/'rules/synonyms.csv').open('a') as f:f.write('ROOT,walk me around,1,true,local custom wording\n')
  self.run_upgrade();self.assertIn('walk me around',(self.root/'rules/synonyms.csv').read_text())
 def test_conflicting_phrase_aborts_without_write(self):
  f=self.root/'rules/synonyms.csv';f.write_text(f.read_text().replace('HISTORICAL_HIGH,highest monthly percentage change,','ROOT,highest monthly percentage change,'));before=self.files()
  with self.assertRaises(ValueError):self.run_upgrade()
  self.assertEqual(before,self.files())
 def test_custom_command_conflict_aborts(self):
  f=self.root/'rules/commands.csv';f.write_text(f.read_text().replace('HISTORICAL_PEAK_GROUPS,','OTHER_PEAK_GROUPS,'));before=self.files()
  with self.assertRaises(ValueError):self.run_upgrade()
  self.assertEqual(before,self.files())
 def test_failed_compiler_does_not_write(self):
  before=self.files()
  with patch.object(Workbench,'compile_blobs',side_effect=ManagerError('Injected compile failure')):
   with self.assertRaises(ManagerError):self.run_upgrade()
  self.assertEqual(before,self.files())
 def test_backup_and_fingerprints(self):
  r=self.run_upgrade();self.assertTrue(r['artifactConsistent']);self.assertTrue(r.get('backupId'));self.assertTrue(list((self.root/'.rule_manager/backups').glob('*/manifest.json')))
 def test_new_capability_is_discovered(self):
  self.run_upgrade();w=Workbench(self.root)
  try:
   cards=w.capabilities.list();self.assertEqual(1,len([r for r in cards['cards'] if r['kind']=='historical_peak_groups']));self.assertEqual(20,len(cards['cards']))
  finally:w.close()
if __name__=='__main__':unittest.main()
