from pathlib import Path
import shutil,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from install_semantic_generalization import upgrade
class GeneralizationInstall(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name)/'project';shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('.git','.rule_manager','reports','__pycache__'))
    def tearDown(self):self.t.cleanup()
    def strip_new(self):
        rp=self.root/'rules/composition_rules.csv';rp.write_text(''.join(x for x in rp.read_text().splitlines(True) if not x.startswith('PLAN_REFERENCE_CONTEXT,') and not x.startswith('PLAN_CONSISTENCY_GATE,')))
        lp=self.root/'rules/lexical_families.csv';phrases={'surge','soar','accelerate','dip','plunge','tumble','fuel','drive','push','lie behind','lies behind','lay behind','lying behind','stem from','stems from','stemmed from','stemming from','result from','results from','resulted from','resulting from','pushed higher','pushed up','pushed lower','pushed down','climbs','expands','contracts','triggers'}
        rows=lp.read_text().splitlines(True);lp.write_text(rows[0]+''.join(x for x in rows[1:] if x.split(',',2)[1] not in phrases))
    def test_additive_and_idempotent(self):
        self.strip_new();result=upgrade(self.root);self.assertTrue(result['changed']);self.assertEqual(set(result['addedShapes']),{'REFERENCE_CONTEXT','CONSISTENCY_GATE'});self.assertGreaterEqual(result['addedLexical'],20);self.assertFalse(upgrade(self.root)['changed'])
    def test_existing_phrase_preserved(self):
        self.strip_new();p=self.root/'rules/lexical_families.csv';p.write_text(p.read_text()+'CAUSE,fuel,false,Custom disabled row\n');upgrade(self.root);self.assertIn('CAUSE,fuel,false,Custom disabled row',p.read_text());self.assertNotIn('CAUSE_LEMMA,fuel,true',p.read_text())
    def test_existing_shape_custom_id_preserved(self):
        self.strip_new();p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text()+'MY_REFERENCE_RULE,REFERENCE_CONTEXT,false,Custom disabled\n');upgrade(self.root);self.assertIn('MY_REFERENCE_RULE,REFERENCE_CONTEXT,false',p.read_text());self.assertNotIn('PLAN_REFERENCE_CONTEXT,REFERENCE_CONTEXT,true',p.read_text())
    def test_conflict_is_atomic(self):
        self.strip_new();p=self.root/'rules/composition_rules.csv';p.write_text(p.read_text()+'PLAN_REFERENCE_CONTEXT,CONSISTENCY_GATE,true,Conflict\n');before={x:x.read_bytes() for x in [p,self.root/'rules/lexical_families.csv',self.root/'command_patterns.txt']};
        with self.assertRaisesRegex(ValueError,'Conflicting'):upgrade(self.root)
        for x,b in before.items():self.assertEqual(x.read_bytes(),b)
if __name__=='__main__':unittest.main(verbosity=2)
