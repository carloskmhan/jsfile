/** Synthetic ID collisions only. No screenshot, live names or bank values in fixtures. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RwaQaEngine} from '../rwa_engine.js';
import {RuleClient} from '../rule_client.js';
import {parseRuleText} from '../semantic/registry.js';
import {Dictionary,identityCatalog} from '../semantic/dictionary.js';
import {indexRowsToCatalog,nameVariants} from '../group_catalog.js';
import {identityChoiceRequest,chooseIdentity,bindIdentitySelection,appendSelectedSubject} from '../semantic/identity_selection.js';
import {planDataRequest} from '../semantic/routing.js';
const registry=parseRuleText(fs.readFileSync(new URL('../command_patterns.txt',import.meta.url),'utf8'));
const groups=[['G001','NORTHBRIDGE BANK LIMITED'],['G002','TWIN HOLDINGS'],['G003','TWIN HOLDINGS'],['G004','SOUTHBRIDGE GROUP']];
const cat=indexRowsToCatalog(groups.map(([id,name])=>({client_group_id:id,client_group_name:name})));
cat.entities=[['G001','E001','NORTHBRIDGE BANK LIMITED'],['G001','E001-1','NORTHBRIDGE BANK LIMITED'],['G002','E002','TWIN CLIENT'],['G003','E002','TWIN CLIENT']]
  .map(([gid,id,name])=>({client_group_id:gid,entity_id:id,entity:name,aliases:nameVariants(name)}));
const rows=cat.entities.flatMap((e,i)=>['2026-06','2026-07'].map((month,j)=>({client_group_id:e.client_group_id,client_group:groups.find(g=>g[0]===e.client_group_id)[1],entity_id:e.entity_id,entity:e.entity,month,rwa_prev:100+i*10,rwa_curr:120+i*10+j*5,drivers:{EAD:12,FX:8+j*5}})));
const make=(mode='guarded',catalog=cat)=>new RwaQaEngine(rows,{commandPatterns:registry,semanticCatalog:catalog,compositionMode:mode,portfolioComplete:true});
const checks=[];
function test(name,fn){try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});console.error('FAIL',name,e);}}
function select(q,key,catalog=cat,selection=null){const request=identityChoiceRequest(q,catalog,registry,selection);assert.ok(request,'Missing choice request');return chooseIdentity(request,key);}
for(const mode of ['off','shadow','guarded']){
 test('Separate group and client choices: '+mode,()=>{
  const q='NORTHBRIDGE BANK',r=identityChoiceRequest(q,cat,registry);
  assert.deepEqual(r.targets.map(t=>t.key),['GROUP:G001','ENTITY:G001/E001','ENTITY:G001/E001-1']);
  for(const key of r.targets.map(t=>t.key)){
   const e=make(mode),selection=select(q,key),before=JSON.stringify(e.state);
   const route=planDataRequest(q,cat,registry,e.state,{identitySelection:selection,compositionMode:mode});
   assert.equal(route.ok,true,route.message);assert.deepEqual(route.groupIds,['G001']);assert.equal(route.portfolio,false);
   const p=e.parseQuestion(q,{selectedMonth:'2026-06',identitySelection:selection});assert.equal(p.ok,true,p.message);
   assert.equal(p.plan.groupId,'G001');assert.equal(p.plan.entityId,key.startsWith('ENTITY')?key.split('/')[1]:null);
   assert.equal(p.plan.period.month,'2026-06');assert.equal(JSON.stringify(e.state),before);
   const a=e.answer(q,{selectedMonth:'2026-06',identitySelection:selection});assert.equal(a.ok,true,a.answer);
   assert.equal(a.result.change,key.startsWith('ENTITY')?20:40);
   assert.equal(e.parseQuestion(q).code,'AMBIGUOUS_ENTITY','A previous click must not teach an alias.');
  }
 });
}
test('Original action, month and exclusions preserved',()=>{
 const q='Explain NORTHBRIDGE BANK RWA increase in June 2026 excluding EAD',selection=select(q,'ENTITY:G001/E001-1'),e=make();
 const a=e.answer(q,{identitySelection:selection}),gold=make().answer('Explain E001-1 RWA increase in June 2026 excluding EAD');
 assert.equal(a.ok,true,a.answer);assert.equal(a.plan.entityId,'E001-1');assert.deepEqual(a.plan.excludedDrivers,['EAD']);assert.equal(a.plan.period.month,'2026-06');assert.deepEqual(a.result,gold.result);
});
test('Partial bare name lists candidates but never auto-selects a sole match',()=>{
 const q='Northbridg',r=identityChoiceRequest(q,cat,registry);assert.equal(r.reason,'PARTIAL_NAME');assert.equal(r.targets.length,3);
 const e=make(),selection=chooseIdentity(r,'GROUP:G001');assert.equal(e.answer(q,{identitySelection:selection}).plan.groupId,'G001');
 const sole=identityChoiceRequest('Southbridg',cat,registry);assert.equal(sole.targets.length,1);
 assert.deepEqual(e.parser.dictionary.resolve('southbridg').names,[]);
});
test('No invented candidates, ID correction or keyword substitution',()=>{
 for(const q of ['G001X','99999','FX','July','RWA','forecast','percentage','only','UnknownZXYZ','Explain Northbridg in July'])assert.equal(identityChoiceRequest(q,cat,registry),null,q);
});
test('Group-only catalogue never advertises unloaded legal clients',()=>{const r=identityChoiceRequest('Northbridg',{...cat,entities:[]},registry);assert.equal(r.targets.length,1);assert.equal(r.targets[0].kind,'GROUP');});
test('Parent group distinguishes same LEID across two groups',()=>{
 const q='Explain TWIN CLIENT in June 2026',sel=select(q,'ENTITY:G003/E002'),e=make(),p=e.parseQuestion(q,{identitySelection:sel});
 assert.equal(p.ok,true,p.message);assert.equal(p.plan.groupId,'G003');assert.equal(p.plan.entityId,'E002');assert.deepEqual(planDataRequest(q,cat,registry,{}, {identitySelection:sel}).groupIds,['G003']);
});
test('Two ambiguous mentions are resolved sequentially without dropping comparison',()=>{
 const q='Compare TWIN HOLDINGS and TWIN HOLDINGS in June 2026',a=select(q,'GROUP:G002'),r=identityChoiceRequest(q,cat,registry,a);
 assert.ok(r.span.start>a.bindings[0].end);const b=chooseIdentity(r,'GROUP:G003'),p=make().parseQuestion(q,{identitySelection:b});
 assert.equal(p.ok,true,p.message);assert.deepEqual(p.plan.comparisonIds,['G002','G003']);assert.equal(p.plan.action,'COMPARE');
});
test('All candidates retained for pagination, not silently cut at 8',()=>{
 const c=indexRowsToCatalog(Array.from({length:29},(_,i)=>({client_group_id:'D'+i,client_group_name:'SHARED GROUP'})));
 assert.equal(identityChoiceRequest('SHARED GROUP',c,registry).targets.length,29);
});
test('Unknown target, tampered type, parent, span or query fail closed',()=>{
 const q='Explain NORTHBRIDGE BANK in June 2026',sel=select(q,'GROUP:G001');
 for(const change of [s=>s.question+=' x',s=>s.bindings[0].key='GROUP:MISSING',s=>s.bindings[0].kind='ENTITY',s=>s.bindings[0].end--,s=>s.bindings.push({...s.bindings[0]}),s=>s.bindings[0].text='FX']){
  const bad=structuredClone(sel);change(bad);const e=make();assert.equal(e.parseQuestion(q,{identitySelection:bad}).ok,false);assert.equal(planDataRequest(q,cat,registry,{}, {identitySelection:bad}).ok,false);assert.deepEqual(e.state,{});
 }
 const es=select(q,'ENTITY:G001/E001');es.bindings[0].parentId='G002';assert.equal(make().parseQuestion(q,{identitySelection:es}).ok,false);
});
test('Removed or renamed identities invalidate offered choices before routing',()=>{
 const q='NORTHBRIDGE BANK',selection=select(q,'GROUP:G001');
 const removed={...cat,groups:cat.groups.filter(g=>g.client_group_id!=='G001'),entities:[]};
 assert.equal(planDataRequest(q,removed,registry,{}, {identitySelection:selection}).ok,false);
 const renamed=indexRowsToCatalog([{client_group_id:'G001',client_group_name:'RENAMED GROUP'}]);assert.equal(planDataRequest(q,renamed,registry,{}, {identitySelection:selection}).ok,false);
});
test('Orphan clients excluded from candidate lists',()=>{
 const restricted={...cat,groups:cat.groups.filter(g=>g.client_group_id!=='G003')};
 const r=identityChoiceRequest('TWIN CLIENT',restricted,registry);assert.equal(r,null);
});
test('Original periods, numbers and driver labels are not selectable identity spans',()=>{
 const e=make();e.parseQuestion('G001');const q='Explain G001 in June 2026 excluding EAD';
 for(const term of ['june','ead']){
  const text=q.toLowerCase(),start=text.indexOf(term),selection={version:'1.0.0',question:text,bindings:[{start,end:start+term.length,text:term,key:'GROUP:G001',kind:'GROUP',id:'G001',parentId:''}]};
  assert.throws(()=>bindIdentitySelection(e.parser.dictionary,q,selection));
 }
});
test('Choosing a name does not discard a forbidden financial qualifier',()=>{
 for(const suffix of [' forecast',' unless EAD increased',' by percentage and balance']){
  const q='Explain NORTHBRIDGE BANK RWA in June 2026'+suffix,sel=select(q,'GROUP:G001'),e=make();
  assert.equal(e.answer(q,{identitySelection:sel}).ok,false,q);assert.deepEqual(e.state,{});
 }
});
test('One-shot preview and cancellation keep state safe with identity bindings',()=>{
 const q='NORTHBRIDGE BANK',sel=select(q,'ENTITY:G001/E001-1'),c=new RuleClient({commandPatterns:registry,semanticCatalog:cat,compositionMode:'guarded'});c.engine=make();c.ready=true;
 let p=c.prepare(q,{identitySelection:sel,selectedMonth:'2026-06'});assert.equal(p.status,'preview');assert.deepEqual(c.state,{});
 c.cancel();assert.throws(()=>c.confirm(p.previewToken));assert.deepEqual(c.state,{});
 p=c.prepare(q,{identitySelection:sel,selectedMonth:'2026-06'});const a=c.confirm(p.previewToken);assert.equal(a.ok,true,a.answer);assert.equal(c.state.entityId,'E001-1');assert.throws(()=>c.confirm(p.previewToken));
 assert.equal(c.state.identitySelection,undefined);
});
test('Pending missing-subject request resumes for exact and partial selections',()=>{
 for(const q of ['NORTHBRIDGE BANK','Northbridg']){
  const sel=select(q,'GROUP:G001'),x=appendSelectedSubject('Explain RWA increase in June 2026',q,sel),e=make();
  const a=e.answer(x.question,{identitySelection:x.selection});assert.equal(a.ok,true,a.answer);assert.equal(a.plan.groupId,'G001');assert.equal(a.plan.period.month,'2026-06');
 }
});
test('Failed selected request and subsequent normal query leave no dictionary binding',()=>{
 const e=make(),q='NORTHBRIDGE BANK',sel=select(q,'GROUP:G001');e.parseQuestion(q,{identitySelection:sel});
 assert.equal(e.parser.dictionary.identitySelectionActive,undefined);assert.equal(e.parseQuestion(q).code,'AMBIGUOUS_ENTITY');
 const p=e.parseQuestion('Explain G002 in June');assert.equal(p.ok,true);assert.equal(p.plan.groupId,'G002');
});
test('Equal group ID and LEID still require and honour a typed selection',()=>{
 const c=indexRowsToCatalog([{client_group_id:'001',client_group_name:'SAMPLE BANK'}]);c.entities=[{client_group_id:'001',entity_id:'001',entity:'SAMPLE BANK',aliases:nameVariants('SAMPLE BANK')}];
 const rr=[{client_group_id:'001',client_group:'SAMPLE BANK',entity_id:'001',entity:'SAMPLE BANK',month:'2026-07',rwa_prev:100,rwa_curr:120,drivers:{EAD:20}}];
 for(const key of ['GROUP:001','ENTITY:001/001']){
  const sel=select('001',key,c),e=new RwaQaEngine(rr,{commandPatterns:registry,semanticCatalog:c});
  const p=e.parseQuestion('001',{identitySelection:sel});assert.equal(p.ok,true,p.message);assert.equal(p.plan.entityId,key.startsWith('ENTITY')?'001':null);
 }
});
const report={scope:'Synthetic request-local identity selection, routing, parser and preview; no live bank data.',passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};
fs.writeFileSync(new URL('../reports/identity_selection_tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,checks:undefined}));if(report.failed)process.exitCode=1;
