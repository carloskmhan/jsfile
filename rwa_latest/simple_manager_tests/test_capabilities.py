"""Tests on disposable copies. Existing compiler and source transaction code run for real."""
from pathlib import Path
import sys,tempfile,shutil,copy,unittest,json,csv,io
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import rule_manager as rm
from capability_manager import META_HEADERS
from local_manager_tests.test_manager import fixture

class CapabilityTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);fixture(self.root);self.w=rm.Workbench(self.root)
 def tearDown(self):self.w.close();self.tmp.cleanup()
 def payload(self,**kw):
  p={'revision':self.w.read_snapshot()['revision'],'operation':'save','title':'Movement in plain English','kind':'movement','measure':'question','numberMode':'question','exampleNumber':10,'periodMode':'question','examples':[{'question':'Take me through Samsung RWA movement in July','phrase':'take me through'}]};p.update(kw);return p
 def commit(self,d):return self.w.capabilities.commit({'revision':d['revision'],'draftId':d['draftId'],'artifactHash':d['artifactHash'],'checkToken':d['checkToken'],'checksPassed':True})
 def add(self,**kw):d=self.w.capabilities.prepare(self.payload(**kw));self.commit(d);return d
 def source(self):return self.w.read_bytes_map()
 def test_existing_capabilities_derived_from_actual_commands(self):
  x=self.w.capabilities.list();self.assertEqual(20,len(x['cards']));self.assertEqual(15,len([c for c in x['cards'] if c['group']!='Follow-up']))
 def test_add_writes_nothing_before_save(self):
  before=self.source();d=self.w.capabilities.prepare(self.payload());self.assertEqual(before,self.source());self.assertIn('take me through',d['generatedText'])
 def test_add_csv_and_generated_file(self):
  d=self.add();self.assertTrue((self.root/'rules/capabilities.csv').exists());self.assertTrue((self.root/'rules/capability_examples.csv').exists());self.assertTrue(self.w.read_snapshot()['artifactConsistent']);self.assertEqual(21,len(self.w.capabilities.list()['cards']))
 def test_unchanged_parser_compiler_weights(self):
  names=['commands.csv','settings.csv','fuzzy_config.csv','units.csv','temporal.csv'];before={n:(self.root/'rules'/n).read_bytes() for n in names};self.add();self.assertEqual(before,{n:(self.root/'rules'/n).read_bytes() for n in names})
 def test_direct_commit_cannot_skip_wizard_checks(self):
  d=self.w.capabilities.prepare(self.payload());before=self.source()
  with self.assertRaises(rm.ManagerError):self.w.commit({'revision':d['revision'],'draftId':d['draftId']})
  self.assertEqual(before,self.source())
 def test_wrong_check_token_cannot_save(self):
  d=self.w.capabilities.prepare(self.payload())
  with self.assertRaises(rm.ManagerError):self.w.capabilities.commit({'revision':d['revision'],'draftId':d['draftId'],'artifactHash':d['artifactHash'],'checkToken':'bad','checksPassed':True})
 def test_no_check_evidence_cannot_save(self):
  d=self.w.capabilities.prepare(self.payload())
  with self.assertRaises(rm.ManagerError):self.w.capabilities.commit({'revision':d['revision'],'draftId':d['draftId'],'artifactHash':d['artifactHash'],'checkToken':d['checkToken'],'checksPassed':False})
 def test_edit_owned_mapping(self):
  old=self.add();self.add(id=old['id'],kind='main_drivers',title='Main drivers in plain English');r=next(r for r in self.w.read_snapshot()['tables']['synonyms.csv']['rows'] if r['phrase']=='take me through');self.assertEqual('MAIN',r['concept'])
 def test_delete_removes_only_unused_owned_expression(self):
  d=self.add();rows=len(self.w.read_snapshot()['tables']['synonyms.csv']['rows']);deleted=self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':d['id']});self.commit(deleted);self.assertEqual(rows-1,len(self.w.read_snapshot()['tables']['synonyms.csv']['rows']));self.assertEqual(20,len(self.w.capabilities.list()['cards']))
 def test_shared_expression_preserved_on_delete(self):
  a=self.add();b=self.add(title='Toyota movement',examples=[{'question':'Take me through Toyota RWA movement in July','phrase':'take me through'}]);d=self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':a['id']});self.commit(d);self.assertIn('take me through',(self.root/'command_patterns.txt').read_text());self.assertEqual(1,len([r for r in self.w.read_snapshot()['tables']['synonyms.csv']['rows'] if r['phrase']=='take me through']))
 def test_shared_expression_cannot_be_reassigned(self):
  a=self.add();self.add(title='Shared');before=self.source()
  with self.assertRaises(rm.ManagerError) as e:self.w.capabilities.prepare(self.payload(id=a['id'],kind='main_drivers'))
  self.assertEqual('EXPRESSION_CONFLICT',e.exception.code);self.assertEqual(before,self.source())
 def test_preexisting_synonym_is_not_deleted(self):
  d=self.add(examples=[{'question':'Explain Samsung in July','phrase':'explain'}]);self.commit(self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':d['id']}));self.assertTrue(any(r['phrase']=='explain' for r in self.w.read_snapshot()['tables']['synonyms.csv']['rows']))
 def test_externally_edited_owned_row_preserved(self):
  d=self.add();f=self.root/'rules/synonyms.csv';s=f.read_text().replace('Simple manager owned; '+d['id'],'Manually reviewed and now shared');f.write_text(s);delete=self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':d['id']});self.commit(delete);self.assertIn('take me through',f.read_text())
 def test_existing_expression_does_not_change_engine(self):
  before=self.source();self.add(examples=[{'question':'Explain Samsung in July'}]);after=self.source();self.assertEqual(before['command_patterns.txt'],after['command_patterns.txt']);self.assertEqual(before['rules/synonyms.csv'],after['rules/synonyms.csv'])
 def test_shared_command_stays_enabled(self):
  a=self.add();d=self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':'builtin:RWA_DRIVER'});self.commit(d);r=next(r for r in self.w.read_snapshot()['tables']['commands.csv']['rows'] if r['command_id']=='RWA_DRIVER');self.assertEqual('true',r['enabled'])
 def test_builtin_delete_disables_referenced_followups(self):
  d=self.w.capabilities.prepare({'revision':self.w.read_snapshot()['revision'],'operation':'delete','id':'builtin:RWA_DRIVER'});self.commit(d);s=self.w.read_snapshot();self.assertEqual('false',next(r for r in s['tables']['commands.csv']['rows'] if r['command_id']=='RWA_DRIVER')['enabled']);self.assertFalse(any(r['enabled']=='true' and r['command_id']=='RWA_DRIVER' for r in s['tables']['followups.csv']['rows']))
 def test_unsupported_kind_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(kind='forecast'))
 def test_known_meaning_cannot_be_shadowed(self):
  before=self.source()
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=[{'question':'Why did Samsung increase in July','phrase':'increase'}]))
  self.assertEqual(before,self.source())
 def test_protected_tokens_rejected(self):
  for phrase in ['excluding','last month','twenty','forecast','greater than','new words 25m','new words without']:
   with self.subTest(phrase=phrase),self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=[{'question':phrase+' Samsung RWA','phrase':phrase}]))
 def test_formula_and_markup_rejected(self):
  for q in ['<script>alert(1)</script>','=WEBSERVICE(abc)','Bad\nsecond line']:
   with self.subTest(q=q),self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=[{'question':q,'phrase':'bad'}]))
 def test_nonliteral_proposal_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=[{'question':'Explain Samsung','phrase':'hidden new words'}]))
 def test_malformed_example_type_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=['not an object']))
 def test_metadata_formula_prefix_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(title='-HYPERLINK(unsafe)'))
 def test_duplicate_examples_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(examples=[{'question':'Explain Samsung'},{'question':'Explain Samsung'}]))
 def test_followup_compiles_existing_patch(self):
  d=self.add(kind='follow_scope',title='Continue for another group',examples=[{'question':'Carry on for Toyota','pattern':'carry on for {scope}'}]);self.assertIn('carry on for {scope}',d['generatedText'])
 def test_followup_reuses_existing_driver_command_reference(self):
  self.add(kind='follow_driver',examples=[{'question':'Continue using EAD','pattern':'continue using {driver}'}]);row=next(x for x in self.w.read_snapshot()['tables']['followups.csv']['rows'] if x['pattern']=='continue using {driver}');self.assertEqual('DRIVER_AMOUNT',row['command_id']);self.assertEqual('driver',row['target_slot'])
 def test_followup_reuses_existing_threshold_slot(self):
  self.add(kind='follow_filter',examples=[{'question':'Retain those above 25m','pattern':'retain those {threshold}'}]);row=next(x for x in self.w.read_snapshot()['tables']['followups.csv']['rows'] if x['pattern']=='retain those {threshold}');self.assertEqual('threshold',row['target_slot'])
 def test_followup_missing_capture_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(kind='follow_scope',examples=[{'question':'Carry on for Toyota','pattern':'carry on for toyota'}]))
 def test_followup_unsupported_condition_rejected(self):
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(kind='follow_scope',examples=[{'question':'Predict Toyota','pattern':'predict {scope}'}]))
 def test_real_compiler_failure_preserves_every_file(self):
  before=self.source()
  # A pattern the management layer can represent but existing compiler refuses.
  with self.assertRaises(rm.ManagerError):self.w.capabilities.prepare(self.payload(kind='follow_scope',examples=[{'question':'Carry on for Toyota','pattern':'carry [on] for {scope}'}]))
  self.assertEqual(before,self.source());self.assertEqual([],self.w.list_backups())
 def test_revision_conflict(self):
  p=self.payload();self.add()
  with self.assertRaises(rm.ManagerError) as e:self.w.capabilities.prepare(p)
  self.assertEqual('REVISION_CONFLICT',e.exception.code)
 def test_restore_recovers_metadata_and_rules(self):
  before=self.source();d=self.add();b=self.w.list_backups()[0]['id'];self.w.restore({'backupId':b,'revision':self.w.read_snapshot()['revision']});self.assertEqual(before,self.source())
 def test_atomic_failure_rolls_back_metadata_too(self):
  d=self.w.capabilities.prepare(self.payload());before=self.source();real=rm.atomic_bytes;failed=False
  def failing(path,data):
   nonlocal failed
   if path==self.root/'command_patterns.txt' and not failed:failed=True;raise OSError('Injected')
   return real(path,data)
  with patch.object(rm,'atomic_bytes',failing),self.assertRaises(OSError):self.commit(d)
  self.assertTrue(failed);self.assertEqual(before,self.source())
 def test_metadata_survives_advanced_edits(self):
  self.add();before={p:self.source()[p] for p in META_HEADERS};s=self.w.read_snapshot();d=self.w.validate({'revision':s['revision'],'tables':s['tables']});self.w.commit({'revision':s['revision'],'draftId':d['draftId']});self.assertEqual(before,{p:self.source()[p] for p in META_HEADERS})
 def test_customer_alias_file_not_reintroduced(self):
  self.add();self.assertFalse((self.root/'rules/aliases.csv').exists());self.assertEqual([],json.loads('\n'.join(l for l in (self.root/'command_patterns.txt').read_text().splitlines() if not l.startswith('#')))['aliases'])
 def test_custom_command_row_visible(self):
  s=self.w.read_snapshot();r=copy.deepcopy(s['tables']['commands.csv']['rows'][0]);r['command_id']='REVIEWED_EXTRA';s['tables']['commands.csv']['rows'].append(r);d=self.w.validate({'revision':s['revision'],'tables':s['tables']});self.w.commit({'draftId':d['draftId'],'revision':s['revision']});self.assertIn('builtin:REVIEWED_EXTRA',[c['id'] for c in self.w.capabilities.list()['cards']])

if __name__=='__main__':unittest.main(verbosity=2)
