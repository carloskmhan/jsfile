"""Checks the evaluation guard, NOT independent accuracy. Synthetic security fixtures only."""
from pathlib import Path
import csv,json,tempfile,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
import holdout_guard as h
results=[]
def test(name,fn):
 try:fn();results.append({'test':name,'passed':True})
 except Exception as e:results.append({'test':name,'passed':False,'error':str(e)})
def raises(fn,text):
 try:fn()
 except ValueError as e:assert text in str(e);return
 raise AssertionError('Expected refusal')
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'corpus.csv';m=Path(d)/'manifest.json';headers=next(csv.reader((ROOT/'tests/holdout_template.csv').open(encoding='utf-8-sig')))
 def write(rows):
  with p.open('w',encoding='utf-8',newline='') as f:w=csv.DictWriter(f,fieldnames=headers);w.writeheader();w.writerows(rows)
 row=dict.fromkeys(headers,'');row.update(id='GUARD_ONLY',conversation_id='GUARD_ONLY',turn='1',question='Please generate an octagonal poem on Jupiter for guard-test fixture Z123',expected_status='REJECT',split='holdout',exact_gold='true',category='GUARD_TEST_NOT_BLIND')
 write([]);test('Empty holdout cannot be evaluated',lambda:raises(lambda:h.validate_corpus(p),'No holdout'))
 write([{**row,'split':'regression'}]);test('Regression label cannot pass holdout guard',lambda:raises(lambda:h.validate_corpus(p),'split=holdout'))
 q=h.cases(ROOT/'tests/questions.csv')[0]['question'];write([{**row,'question':q}]);test('Relabelled known question is detected',lambda:raises(lambda:h.validate_corpus(p),'overlap'))
 write([{**row,'expected_status':'ACCEPT','exact_gold':'false'}]);test('Incomplete accepted gold cannot be sealed',lambda:raises(lambda:h.validate_corpus(p),'complete gold'))
 write([row]);manifest={'reviewer':'SYNTHETIC GUARD TEST NOT INDEPENDENT','runtimeHashes':h.runtime_hashes(),'corpusSha256':h.sha(p)};m.write_text(json.dumps(manifest));test('Intact guard fixture verifies hashes',lambda:h.verify_manifest(p,m))
 write([{**row,'question':row['question']+' edited'}]);test('Corpus edit after seal is detected',lambda:raises(lambda:h.verify_manifest(p,m),'changed after sealing'))
 write([row]);manifest['runtimeHashes']['semantic/fuzzy.js']='fake';m.write_text(json.dumps(manifest));test('Runtime hash mismatch retires seal',lambda:raises(lambda:h.verify_manifest(p,m),'Runtime/rules/data changed'))
report={'suite':'Holdout workflow integrity checks, not a blind corpus evaluation','passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'tests':results};(ROOT/'reports/holdout_guard_tests.json').write_text(json.dumps(report,indent=2));print({k:v for k,v in report.items() if k!='tests'});raise SystemExit(bool(report['failed']))
