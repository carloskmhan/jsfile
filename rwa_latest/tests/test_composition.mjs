import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RwaQaEngine} from '../rwa_engine.js';
import {RuleClient} from '../rule_client.js';
import {parseRuleText,validateRegistry} from '../semantic/registry.js';
import {loadFixtures,actualFields} from '../tools/evaluate.mjs';
import {composeLexical} from '../semantic/composition_lexicon.js';
import {semanticFrame} from '../semantic/composition_frame.js';
import {planDataRequest} from '../semantic/routing.js';
import {indexRowsToCatalog} from '../group_catalog.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=parseRuleText(read('command_patterns.txt')),data=loadFixtures(),catalog=JSON.parse(read('rwa_sample_data.txt'));
const make=(mode='guarded',reg=registry)=>new RwaQaEngine(data.rows,{...data,commandPatterns:reg,semanticCatalog:catalog,portfolioComplete:true,compositionMode:mode});
const e=make(),baseline=make('off'),checks=[];
function test(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
let newAcceptances=0;
for(const item of JSON.parse(read('tests/composition_cases.json')).cases){
 test(item.id+' '+item.question,()=>{
  e.reset();baseline.reset();
  const before=JSON.stringify(e.state),parsed=e.parseQuestion(item.question);
  assert.equal(JSON.stringify(e.state),before,'Parse must be read-only.');
  if(item.expected==='LEGACY_ACCEPT'){const old=baseline.parseQuestion(item.question);assert.equal(old.ok,true);assert.equal(parsed.ok,true);assert.deepEqual(actualFields(parsed.plan),actualFields(old.plan));return;}
  if(item.expected==='REJECT'){
   assert.equal(parsed.ok,false,'Hard negative became executable.');
   const answer=e.answer(item.question);assert.equal(answer.ok,false);assert.equal(JSON.stringify(e.state),before);return;
  }
  assert.equal(parsed.ok,true,parsed.code+' '+parsed.message);
  const reference=baseline.parseQuestion(item.canonical);
  assert.equal(reference.ok,true,'Invalid test canonical: '+reference.code+' '+reference.message);
  assert.deepEqual(actualFields(parsed.plan),actualFields(reference.plan));
  const answer=e.answer(item.question),gold=baseline.answer(item.canonical);
  assert.equal(answer.ok,true,answer.answer);assert.equal(gold.ok,true,gold.answer);
  assert.deepEqual(answer.result,gold.result);assert.deepEqual(answer.table,gold.table);
  assert.deepEqual(answer.warnings,gold.warnings);assert.equal(answer.answer,gold.answer);
  const route=planDataRequest(item.question,catalog,registry,{},{}),canonicalRoute=planDataRequest(item.canonical,catalog,registry,{},{});
  assert.deepEqual(route,canonicalRoute,'New primitives must not change authorised data scope.');
  if(parsed.explain.composition){
   newAcceptances++;const f=parsed.explain.composition.frame;
   for(const key of ['ACTION','TARGET','MEASURE','DIRECTION','PERIOD','RANK','FILTER','EXCLUSION','RELATION'])assert.ok(key in f);
   assert.deepEqual(f.unresolved,[]);assert.deepEqual(f.contradictions,[]);
   for(const m of f.lexicalEvidence)assert.equal(parsed.explain.normalization.slice(m.start,m.end),m.text);
  }
 });
}
test('The extension adds actual new executable expressions',()=>assert.ok(newAcceptances>=50));
test('Shadow is observational, then guarded executes',()=>{
 const shadow=make('shadow'),q='What triggered Samsung RWA increase in June 2026?';
 const original=baseline.parseQuestion(q),result=shadow.parseQuestion(q);
 assert.equal(result.ok,original.ok);assert.equal(result.code,original.code);
 assert.equal(shadow.parser.lastComposition.decision,'COMPOSED_CANDIDATE');assert.deepEqual(shadow.state,{});
 shadow.parser.lastComposition.frame.TARGET.groupId='MUTATED_DIAGNOSTIC';assert.deepEqual(shadow.state,{});
});
test('Off path emits no composition diagnostics',()=>{baseline.parseQuestion('What triggered Samsung RWA increase?');assert.equal(baseline.parser.lastComposition,null);});
test('Unknown deployment mode rejected',()=>assert.throws(()=>make('automatic'),/compositionMode/));
test('Old artifact remains supported without optional extension',()=>{const r=JSON.parse(JSON.stringify(registry));delete r.composition;assert.equal(make('guarded',r).parseQuestion('What triggered Samsung RWA increase?').ok,false);});
test('Original dictionary is never mutated',()=>{e.parseQuestion('What triggered Samsung RWA increase?');assert.equal(e.parser.dictionary.resolve('triggered').matches.length,0);});
test('New words do not steal full customer names or IDs',()=>{
 const cat=indexRowsToCatalog([{client_group_id:'001',client_group_name:'Expanded Group'},{client_group_id:'002',client_group_name:'Trigger Holdings'}]);
 const rows=[{client_group_id:'001',client_group:'Expanded Group',entity_id:'01',entity:'Entity A',month:'2026-07',rwa_prev:100,rwa_curr:110,drivers:{EAD:10}},{client_group_id:'002',client_group:'Trigger Holdings',entity_id:'02',entity:'Entity B',month:'2026-07',rwa_prev:200,rwa_curr:220,drivers:{EAD:20}}];
 const x=new RwaQaEngine(rows,{commandPatterns:registry,semanticCatalog:cat,compositionMode:'guarded'});
 const a=x.parseQuestion('What triggered Expanded Group RWA increase in July?');assert.equal(a.ok,true,a.message);assert.equal(a.plan.groupId,'001');
 assert.equal(a.explain.composition.frame.lexicalEvidence.length,1);
 const b=x.parseQuestion('What triggered Trigger Holdings RWA increase in July?');assert.equal(b.ok,true,b.message);assert.equal(b.plan.groupId,'002');
});
test('Complete driver labels retain their internal vocabulary',()=>{
 const rows=[{client_group_id:'001',client_group:'Example Group',entity_id:'01',entity:'Entity',month:'2026-07',rwa_prev:100,rwa_curr:110,drivers:{'Expanded RWA exposure':10}}];
 const cat=indexRowsToCatalog([{client_group_id:'001',client_group_name:'Example Group'}]);
 const x=new RwaQaEngine(rows,{commandPatterns:registry,semanticCatalog:cat,compositionMode:'guarded'});
 x.parseQuestion('Explain 001 RWA in July');const prepared=composeLexical('What triggered 001 RWA increase due to Expanded RWA exposure in July?',x.parser.dictionary,registry);
 assert.deepEqual(prepared.composition.additions.map(m=>m.text),['triggered']);
});
test('Composition max-match limit fails closed',()=>{e.parseQuestion('Explain Samsung');const q='What triggered Samsung RWA '+Array(17).fill('grown').join(' ');assert.equal(composeLexical(q,e.parser.dictionary,registry).error,'COMPOSITION_LIMIT');assert.equal(e.parseQuestion(q).ok,false);});
test('Tampered runtime extension rejected',()=>{for(const mutate of [r=>r.composition.maxMatches=100,r=>r.composition.lexicalFamilies[0].phrase='not',r=>r.composition.rules[0].actions=['FORECAST'],r=>r.composition.lexicalFamilies[0].concept='BALANCE']){const r=JSON.parse(JSON.stringify(registry));mutate(r);assert.throws(()=>validateRegistry(r),/composition artifact/);}});
test('Existing follow-ups work after a composed successful report',()=>{
 const x=make();assert.equal(x.answer('What triggered Samsung RWA increase in July?').ok,true);
 let a=x.answer('How about Toyota?');assert.equal(a.ok,true,a.answer);assert.equal(a.plan.groupId,'CG0004');
 a=x.answer('And June?');assert.equal(a.ok,true,a.answer);assert.equal(a.plan.period.month,'2026-06');
 a=x.answer('Same but exclude EAD');assert.equal(a.ok,true,a.answer);assert.deepEqual(a.plan.excludedDrivers,['EAD']);
});
test('Typed context patch never drops additional recognised qualifiers',()=>{
 const x=make();assert.equal(x.answer('What triggered Samsung RWA increase in July?').ok,true);
 for(const q of ['Same but exclude EAD percentage','Same but exclude EAD only','Same but exclude EAD and include FX','Same but exclude July','Same but exclude EAD by balance']){
   const before=JSON.stringify(x.state);assert.equal(x.answer(q).ok,false,q);assert.equal(JSON.stringify(x.state),before);
 }
});
test('Rank references are existing ID-bound patches after composed ranking',()=>{
 const x=make();assert.equal(x.answer('Show top 5 groups by RWA expanded in July 2026').ok,true);
 const second=x.state.references[1].id;const a=x.answer('What about the second one?');assert.equal(a.ok,true,a.answer);assert.equal(a.plan.groupId,second);
});
test('Historical frame keeps monthly selection separate from ranking',()=>{
 const a=baseline.parseQuestion('Show top 5 groups by highest monthly percentage change over all history',{selectedMonth:'2026-07'});
 assert.equal(a.ok,true,a.message);const f=semanticFrame(a.plan,a.explain);
 assert.equal(f.MEASURE.basis,'ADJACENT_MONTH_PERCENT_CHANGE');assert.equal(f.RANK.withinGroupSelection,'MAX_MONTHLY_PERCENT');assert.equal(f.RANK.acrossGroups,'ORDER_SELECTED_MONTHLY_PERCENT');
});
test('Mode/artifact changes invalidate pending preview',()=>{
 const config={commandPatterns:registry,semanticCatalog:catalog,compositionMode:'guarded'},client=new RuleClient(config);
 // Use the same facade with an initialized synthetic engine; provider loading is covered separately.
 client.engine=make();client.ready=true;client.state=client.engine.state;
 let p=client.prepare('What triggered Samsung RWA increase in July?');assert.equal(p.status,'preview');
 client.setCompositionMode('off');assert.throws(()=>client.confirm(p.previewToken),/expired/);
 client.setCompositionMode('guarded');p=client.prepare('What triggered Samsung RWA increase in July?');config.commandPatterns={...registry};assert.throws(()=>client.confirm(p.previewToken),/expired/);
});
test('Confirmed composed preview executes once; cancellation never commits',()=>{
 const c=new RuleClient({commandPatterns:registry,semanticCatalog:catalog,compositionMode:'guarded'});c.engine=make();c.ready=true;c.state=c.engine.state;
 let p=c.prepare('What triggered Samsung RWA increase in July?');assert.equal(p.status,'preview');const state=JSON.stringify(c.state);c.cancel();assert.equal(JSON.stringify(c.state),state);assert.throws(()=>c.confirm(p.previewToken),/expired/);
 p=c.prepare('What triggered Samsung RWA increase in July?');const a=c.confirm(p.previewToken);assert.equal(a.ok,true,a.answer);assert.throws(()=>c.confirm(p.previewToken),/expired/);
});
const report={legacyFindings:JSON.parse(read('tests/composition_cases.json')).legacyFindings,scope:'Developer-authored composition, adversarial, ownership, routing and preview tests; not a blind MiniLM comparison.',newAcceptances,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};
fs.writeFileSync(new URL('../reports/composition_tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,checks:undefined},null,2));if(report.failed)process.exitCode=1;
