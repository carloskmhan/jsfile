/** Developer-authored positive/metamorphic/adversarial evidence. NOT an independent blind MiniLM benchmark. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RwaQaEngine} from '../rwa_engine.js';
import {RuleClient} from '../rule_client.js';
import {parseRuleText,validateRegistry} from '../semantic/registry.js';
import {indexRowsToCatalog} from '../group_catalog.js';
import {planDataRequest} from '../semantic/routing.js';
import {prepareSemanticPlanning,validateMeaningContract} from '../semantic/semantic_planner.js';
import {loadFixtures,actualFields} from '../tools/evaluate.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=parseRuleText(read('command_patterns.txt'));
const defs=[['001','SAMPLE A GROUP',100,120,8],['002','SAMPLE B GROUP',10,20,2],['003','SAMPLE C GROUP',1000,1050,45],['004','SAMPLE D GROUP',20,25,1],['005','SAMPLE E GROUP',100,80,-10]];
const catalog=indexRowsToCatalog(defs.map(([id,name])=>({client_group_id:id,client_group_name:name})));
const rows=defs.flatMap(([id,name,prev,curr,ead])=>['2026-06','2026-07'].map(month=>({client_group_id:id,client_group:name,entity_id:'E'+id,entity:name+' ENTITY',month,rwa_prev:prev,rwa_curr:curr,drivers:{EAD:ead,FX:curr-prev-ead}})));
const make=(mode='guarded',rules=registry)=>new RwaQaEngine(rows,{commandPatterns:rules,semanticCatalog:catalog,portfolioComplete:true,compositionMode:mode});
const checks=[];let newPaths=0;
function test(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
function run(q,{ids=['004','001','003'],op='GTE',period='2026-07'}={}){
  const e=make(),before=JSON.stringify(e.state),p=e.parseQuestion(q);
  assert.equal(JSON.stringify(e.state),before);assert.equal(p.ok,true,p.code+': '+p.message);
  assert.equal(p.plan.metric,'PERCENT');assert.equal(p.plan.condition.metric,'BALANCE');assert.equal(p.plan.condition.op,op);assert.equal(p.plan.condition.value,25);assert.equal(p.plan.period.month,period);
  const frame=p.explain.semanticPlanning;assert.ok(frame,'The new frame-first path must actually run.');
  newPaths++;assert.equal(frame.stage,'BEFORE_COMMAND_SELECTION');assert.equal(frame.ACTION,'TOP_CLIENTS');assert.equal(frame.MEASURE.metric,'PERCENT');assert.equal(frame.FILTER.metric,'BALANCE');
  assert.equal(frame.FILTER.application,'BEFORE_TOP_N');assert.deepEqual(frame.unresolved,[]);assert.deepEqual(frame.contradictions,[]);
  for(const ev of frame.evidence)assert.equal(p.explain.normalization.slice(ev.start,ev.end),ev.text);
  const a=e.answer(q);assert.equal(a.ok,true,a.answer);assert.deepEqual(a.result.items.map(x=>x.groupId),ids);
  return {e,a,p};
}
for(const unit of ['25m','25 million','25,000,000','USD 25m'])for(const metric of ['percentage increase','RWA percentage increase','RWA percent growth'])for(const order of ['before','after']){
 const month=order==='before'?' in July 2026':'';
 const q=`Show top 5 groups by ${metric}${month}, excluding groups with RWA below ${unit}${order==='after'?' in July 2026':''}`;
 test('Independent roles: '+q,()=>run(q));
}
for(const [operator,op,ids] of [['above','GT',['001','003']],['at least','GTE',['004','001','003']],['below','LT',['002']],['at most','LTE',['002','004']]]){
 test('Balance predicate '+operator,()=>run(`Show top 5 groups by RWA percentage increase with RWA balance ${operator} 25m in July 2026`,{op,ids}));
}
for(const [operator,op,ids] of [['below','GTE',['004','001','003']],['at most','GT',['001','003']],['above','LTE',['002','004']],['at least','LT',['002']],['no less than','LT',['002']],['no more than','GT',['001','003']]]){
 test('Predicate complement '+operator,()=>run(`Show top 5 groups by percentage increase excluding groups with RWA ${operator} 25m in July 2026`,{op,ids}));
}
test('Filtering occurs before top N',()=>run('Show top 1 groups by percentage increase excluding groups with RWA below 25m in July 2026',{ids:['004']}));
test('No live execution or external state from mutated diagnostic frame',()=>{
 const {e,p}=run('Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026');
 const state=JSON.stringify(e.state);p.explain.semanticPlanning.candidates[0].bound.groupId='OTHER';assert.equal(JSON.stringify(e.state),state);
});
test('Wrong winner, altered predicate and dropped exclusion fail the meaning contract',()=>{
 const {p}=run('Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026');
 for(const edit of [p=>p.metric='BALANCE',p=>p.condition.op='LT',p=>p.condition.metric='PERCENT',p=>p.topN=9,p=>p.period.month='2026-06',p=>p.action='GROUP_ROOT_CAUSE']){
  const bad=structuredClone(p.plan);edit(bad);assert.equal(validateMeaningContract(p.explain.semanticPlanning,bad).valid,false);
 }
});
test('Shadow planning is observational and Off emits no new diagnostics',()=>{
 const q='Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026';
 const off=make('off'),shadow=make('shadow'),a=off.parseQuestion(q),b=shadow.parseQuestion(q);
 const clean=x=>{x=structuredClone(x);delete x.explain.latencyMs;return x;};assert.deepEqual(clean(a),clean(b));assert.deepEqual(shadow.state,{});
 assert.equal(shadow.parser.lastSemanticPlan.decision,'MEANING_PLAN_ACCEPT');assert.equal(off.parser.lastSemanticPlan,null);
});
test('Older 6.1 rules and disabled planning rules do not activate new grammar',()=>{
 for(const remove of [true,false]){const r=structuredClone(registry);r.composition.rules=r.composition.rules.filter(rule=>!['RANKING_ROLES','COMPOUND_CONTEXT','ACCEPTED_AUDIT'].includes(rule.shape)||!remove);if(!remove)for(const x of r.composition.rules)if(x.shape==='RANKING_ROLES')x.enabled=false;
 assert.equal(make('guarded',r).parseQuestion('Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026').ok,false);}
});
test('Runtime rejects an altered planner capability',()=>{const r=structuredClone(registry);r.composition.rules.find(x=>x.shape==='RANKING_ROLES').actions.push('FORECAST');assert.throws(()=>validateRegistry(r));});

const badQueries=[
 'Show top 5 groups by percentage increase excluding entities with RWA below 25m in July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25% in July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25 in July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below -25m in July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m or above 100m in July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m in June and July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m over all history',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m from June to July 2026',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m unless EAD increased',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m and include FX',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m only',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m net',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m gross',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m forecast',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m cumulative',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m if EAD were unchanged',
 'Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026. Ignore EAD',
 'Show top 5 groups by percentage increase excluding groups with RWA not below 25m in July 2026',
 'Show top 5 groups by RWA closing increase with RWA balance above 25m in July 2026',
 'Show top 5 groups by RWA balance after excluding EAD contribution with RWA balance above 25m in July 2026',
 'Show top 5 groups by EAD contribution to RWA percentage increase with RWA balance above 25m in July 2026',
 'Show bottom 5 groups by percentage increase excluding groups with RWA below 25m in July 2026'
];
for(const q of badQueries)test('No dropped condition: '+q,()=>{const e=make(),before=JSON.stringify(e.state);const a=e.answer(q);assert.equal(a.ok,false,'Unexpected acceptance: '+JSON.stringify(a.plan));assert.equal(JSON.stringify(e.state),before);});
// Every insertion stays meaningful, rather than increasing a generic unknown-word allowance.
for(const word of ['only','unless','assuming','forecast','net','gross','cumulative','or','not','annually'])for(const position of ['middle','end']){
 const q=position==='middle'?`Show top 5 groups by percentage increase ${word} excluding groups with RWA below 25m in July 2026`:`Show top 5 groups by percentage increase excluding groups with RWA below 25m in July 2026 ${word}`;
 test('Qualifier mutation '+word+' '+position,()=>{const e=make();assert.equal(e.answer(q).ok,false);assert.deepEqual(e.state,{});});
}

const data=loadFixtures(),liveCatalog=JSON.parse(read('rwa_sample_data.txt'));
const normal=(mode='guarded')=>new RwaQaEngine(data.rows,{...data,commandPatterns:registry,semanticCatalog:liveCatalog,portfolioComplete:true,compositionMode:mode});
const start=e=>{assert.equal(e.answer('What triggered Samsung RWA increase in July 2026?').ok,true);assert.equal(e.answer('Same but exclude EAD').ok,true);};
for(const q of ['Same analysis for Toyota in June 2026, but include EAD this time','Same report in June 2026 for Toyota but include EAD','Do the same analysis but include EAD this time for Toyota in June 2026']){
 test('Atomic compound '+q,()=>{const e=normal(),gold=normal();start(e);start(gold);for(const step of ['How about Toyota?','And June?','Include EAD'])assert.equal(gold.answer(step).ok,true,step);
 const p=e.parseQuestion(q),before=JSON.stringify(e.state);assert.equal(p.ok,true,p.message);assert.equal(JSON.stringify(e.state),before);assert.ok(p.explain.semanticPlanning);
 assert.equal(p.explain.semanticPlanning.RELATION.contextChangesAtomic,true);assert.deepEqual(new Set(p.explain.semanticPlanning.RELATION.operations),new Set(['REPLACE_SCOPE','REPLACE_PERIOD','INCLUDE']));
 const a=e.answer(q),expected=gold.answer('Again');assert.equal(a.ok,true,a.answer);assert.deepEqual(actualFields(a.plan),actualFields(expected.plan));assert.deepEqual(a.result,expected.result);assert.equal(a.answer,expected.answer);newPaths++;
 const route=planDataRequest(q,liveCatalog,registry,{...gold.state,groupId:'CG0001'},{compositionMode:'guarded',selectedClientGroupId:'CG0001'});assert.equal(route.ok,true,route.message);assert.deepEqual(route.groupIds,['CG0004']);assert.equal(route.portfolio,false);
 });
}
for(const suffix of ['only','and include FX','percentage','by balance','net','gross','and July','or Samsung','unless RWA increased']){
 test('Compound invalid suffix leaves state '+suffix,()=>{const e=normal();start(e);const before=JSON.stringify(e.state);const r=e.answer('Same analysis for Toyota in June 2026 but exclude EAD '+suffix);assert.equal(r.ok,false);assert.equal(JSON.stringify(e.state),before);});
}
test('Unresolved slot gives a focused clarification without patching context',()=>{const e=normal();start(e);const before=JSON.stringify(e.state),p=e.parseQuestion('Same analysis for Toyota in June 2026 but exclude');assert.equal(p.ok,false);assert.equal(p.explain.clarification.field,'driver to include or exclude');assert.equal(p.explain.clarification.preservesSuccessfulContext,true);assert.equal(JSON.stringify(e.state),before);});
test('No compound context from a pending preview',()=>{const c=new RuleClient({commandPatterns:registry,compositionMode:'guarded'});c.engine=normal();c.ready=true;c.state=c.engine.state;c.prepare('What triggered Samsung RWA increase in July 2026?');const p=c.prepare('Same analysis for Toyota in June 2026 but include EAD');assert.equal(p.ok,false);assert.equal(p.code,'MISSING_CONTEXT');assert.deepEqual(c.state,{});});
test('Historical and portfolio reports are not repurposed by compound scope change',()=>{
 for(const first of ['Show top 5 groups by RWA increase in July 2026','Show top 5 groups by highest monthly percentage change over all history']){const e=normal();assert.equal(e.answer(first).ok,true);const before=JSON.stringify(e.state);assert.equal(e.answer('Same analysis for Toyota in June 2026 but include EAD').ok,false);assert.equal(JSON.stringify(e.state),before);}
});
test('Routing uses executed scope, not a changed UI selection',()=>{const e=normal();start(e);e.answer('How about Toyota?');const q='Same analysis in June 2026 but include EAD',r=planDataRequest(q,liveCatalog,registry,e.state,{selectedClientGroupId:'CG0001',compositionMode:'guarded'});assert.equal(r.ok,true,r.message);assert.deepEqual(r.groupIds,['CG0004']);const p=e.parseQuestion(q,{selectedClientGroupId:'CG0001'});assert.equal(p.plan.groupId,r.groupIds[0]);});
test('Routing never loads UI scope for an unresolved replacement group',()=>{const e=normal();start(e);const r=planDataRequest('Same analysis for UnknownXYZ in June 2026 but include EAD',liveCatalog,registry,e.state,{selectedClientGroupId:'CG0001',compositionMode:'guarded'});assert.equal(r.ok,false);assert.equal(r.code,'UNKNOWN_ENTITY');});
test('Removed group is not replaced by a different authorised group',()=>{const e=normal();start(e);const restricted={...liveCatalog,groups:liveCatalog.groups.filter(g=>g.client_group_id!=='CG0001')};const r=planDataRequest('Same analysis in June 2026 but include EAD',restricted,registry,e.state,{selectedClientGroupId:'CG0004',compositionMode:'guarded'});assert.equal(r.ok,false);});
test('Preview cancellation, mode changes, execution errors and repeat confirmation do not patch state',()=>{
 const c=new RuleClient({commandPatterns:registry,compositionMode:'guarded'});c.engine=normal();c.ready=true;c.state=c.engine.state;c.answer('What triggered Samsung RWA increase in July 2026?');const before=JSON.stringify(c.state);
 let p=c.prepare('Same analysis for Toyota in June 2026 but include EAD');assert.equal(p.status,'preview');c.cancel();assert.equal(JSON.stringify(c.state),before);assert.throws(()=>c.confirm(p.previewToken));
 p=c.prepare('Same analysis for Toyota in June 2026 but include EAD');c.setCompositionMode('off');assert.throws(()=>c.confirm(p.previewToken));assert.equal(JSON.stringify(c.state),before);c.setCompositionMode('guarded');
 p=c.prepare('Same analysis for Toyota in January 2026 but include EAD');assert.equal(p.status,'preview');assert.equal(c.confirm(p.previewToken).ok,false);assert.equal(JSON.stringify(c.state),before);
 p=c.prepare('Same analysis for Toyota in June 2026 but include EAD');assert.equal(c.confirm(p.previewToken).ok,true);assert.throws(()=>c.confirm(p.previewToken));
});
test('Material legacy/structured disagreement is clarified in guarded mode',()=>{const q='Show top 5 groups by RWA increase with RWA balance above 25m in July 2026',e=make(),off=make('off'),shadow=make('shadow');const a=e.answer(q),b=off.answer(q),c=shadow.answer(q);assert.equal(b.ok,true);assert.equal(c.ok,true);assert.equal(a.ok,false);assert.equal(a.code,'AMBIGUOUS_SEMANTIC_BINDING');assert.ok(e.parser.lastSemanticAudit.findings.some(f=>f.code==='ROLE_BINDING_DISAGREEMENT'&&f.field==='metric'));assert.ok(e.parser.lastSemanticAudit.candidateGraph.candidates.length>=2);assert.equal(e.parser.lastSemanticAudit.candidateGraph.ambiguous,true);});
test('Undefined net/gross semantics are clarified only in guarded mode',()=>{for(const word of ['net','gross']){const e=normal(),off=normal('off'),shadow=normal('shadow');const q='Why has Samsung RWA risen in July 2026 '+word,a=e.answer(q);assert.equal(off.answer(q).ok,true);assert.equal(shadow.answer(q).ok,true);assert.equal(a.ok,false);assert.equal(a.code,'AMBIGUOUS_SEMANTIC_BINDING');assert.ok(e.parser.lastSemanticAudit.findings.some(x=>x.code==='UNDEFINED_AGGREGATION_BASIS'));}});
test('Protected customer and driver labels do not generate gross/net warnings',()=>{
 const cat=indexRowsToCatalog([{client_group_id:'001',client_group_name:'Gross Holdings'}]);const rr=[{...rows[0],client_group:'Gross Holdings',drivers:{'Net FX adjustment':20}}];const e=new RwaQaEngine(rr,{commandPatterns:registry,semanticCatalog:cat,compositionMode:'guarded'});
 const a=e.parseQuestion('Explain Gross Holdings RWA in June 2026');assert.equal(a.ok,true,a.message);assert.equal(e.parser.lastSemanticAudit.findings.length,0);
});
test('Input limit stops before semantic search',()=>{const e=make();const q='Same analysis '+ 'x'.repeat(registry.settings.max_query_chars);assert.equal(e.parseQuestion(q).code,'INVALID_INPUT');assert.equal(e.parser.lastSemanticPlan,null);});
test('Entity ranking retains its group rather than loading a portfolio',()=>{
 const q='Show top 3 entities for 001 by percentage increase with RWA balance above 25m in July 2026',e=make();
 const p=e.parseQuestion(q);assert.equal(p.ok,true,p.message);assert.equal(p.plan.action,'TOP_ENTITY');assert.equal(p.plan.groupId,'001');assert.equal(p.plan.metric,'PERCENT');
 const route=planDataRequest(q,catalog,registry,{}, {compositionMode:'guarded'});assert.equal(route.ok,true,route.message);assert.equal(route.portfolio,false);assert.deepEqual(route.groupIds,['001']);
 const a=e.answer(q);assert.equal(a.ok,true,a.answer);assert.deepEqual(a.result.items.map(x=>x.entityId),['E001']);newPaths++;
});
test('Operator-boundary membership is independently checked',()=>{
 const a=run('Show top 5 groups by RWA percentage increase with RWA balance at least 25m in July 2026');
 assert.equal(a.a.result.items.find(x=>x.groupId==='004').rwa_curr,25);
});
test('No alias or exact ID guessing in a compound group replacement',()=>{
 const e=normal();start(e);const before=JSON.stringify(e.state);
 for(const name of ['CG000400','Toyotaaa','Unknown Holdco'])assert.equal(e.answer('Same analysis for '+name+' in June 2026 but include EAD').ok,false);
 assert.equal(JSON.stringify(e.state),before);
});
test('Duplicate group names require IDs in parsing and routing',()=>{
 const cc=indexRowsToCatalog([{client_group_id:'001',client_group_name:'Twin Holdings'},{client_group_id:'002',client_group_name:'Twin Holdings'}]);
 const rr=rows.filter(r=>['001','002'].includes(r.client_group_id)).map(r=>({...r,client_group:'Twin Holdings'}));
 const e=new RwaQaEngine(rr,{commandPatterns:registry,semanticCatalog:cc,compositionMode:'guarded'});assert.equal(e.answer('Explain 001 RWA in July 2026').ok,true);
 const q='Same analysis for Twin Holdings in June 2026 but include EAD',before=JSON.stringify(e.state);assert.equal(e.answer(q).ok,false);assert.equal(JSON.stringify(e.state),before);
 assert.equal(planDataRequest(q,cc,registry,e.state,{compositionMode:'guarded'}).ok,false);
 assert.equal(e.answer('Same analysis for 002 in June 2026 but include EAD').plan.groupId,'002');
});
test('Protected driver qualifiers do not count as undefined aggregation',()=>{
 const rr=rows.map(r=>({...r,drivers:{'Gross adjustment':r.rwa_curr-r.rwa_prev}}));
 const e=new RwaQaEngine(rr,{commandPatterns:registry,semanticCatalog:catalog,compositionMode:'guarded',portfolioComplete:true});
 const a=e.parseQuestion('Show top 5 groups by Gross adjustment contribution to RWA increase in July 2026');assert.equal(a.ok,true,a.message);
 assert.equal(e.parser.lastSemanticAudit?.findings.some(x=>x.code==='UNDEFINED_AGGREGATION_BASIS'),false);
});

test('Productive morphology and abstraction hierarchy generalize reviewed language',()=>{
 const cases=[
  ['What fuelled Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA'],
  ['What lay behind Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE'],
  ['What pushed Samsung RWA higher in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA'],
  ['Did Samsung RWA tumble in July 2026?','MOVEMENT_CHECK','FALL_LEMMA']
 ];
 for(const [q,action,family] of cases){const e=normal(),off=normal('off'),a=e.parseQuestion(q);assert.equal(a.ok,true,q);assert.equal(a.plan.action,action);if(!off.parseQuestion(q).ok)newPaths++;const ev=a.explain.composition?.frame?.lexicalEvidence||[];assert.ok(ev.some(x=>x.family===family),q);assert.ok(ev.some(x=>Array.isArray(x.abstractionPath)&&x.abstractionPath.length>=2),q);}
});
test('Ranked-result reference and period change are atomic',()=>{
 const e=normal();assert.equal(e.answer('Show top 5 groups by RWA increase in July 2026').ok,true);const expected=e.state.references[1];const before=JSON.stringify(e.state);
 const q='What about the second one, but in June 2026?',p=e.parseQuestion(q);assert.equal(p.ok,true,p.message);assert.equal(JSON.stringify(e.state),before);assert.equal(p.plan.groupId,expected.kind==='GROUP'?expected.id:expected.parentId);assert.equal(p.plan.period.month,'2026-06');assert.equal(p.explain.semanticPlanning.shape,'REFERENCE_CONTEXT');
 const route=planDataRequest(q,liveCatalog,registry,e.state,{compositionMode:'guarded'});assert.equal(route.ok,true,route.message);assert.deepEqual(route.groupIds,[expected.kind==='GROUP'?expected.id:expected.parentId]);
 const a=e.answer(q);assert.equal(a.ok,true,a.answer);assert.equal(a.plan.period.month,'2026-06');newPaths++;
});
test('Meaning frame exposes typed predicate and relation trees',()=>{
 const e=make(),p=e.parseQuestion('Show top 5 groups by percentage increase after excluding EAD contribution with RWA balance above 25m in July 2026');assert.equal(p.ok,true,p.message);const f=p.explain.semanticPlanning;assert.equal(f.PREDICATES.type,'AND');assert.ok(f.PREDICATES.children.some(x=>x.type==='PREDICATE'&&x.metric==='BALANCE'));assert.ok(f.PREDICATES.children.some(x=>x.type==='EXCLUSION'&&x.target==='DRIVER_ATTRIBUTION'&&x.value==='EAD'));assert.equal(f.RELATION.tree.type,'RELATIONS');
});

const report={scope:'Synthetic developer-authored independent numeric expectations, structural composition, mutation negatives, atomic context, authorisation routing and read-only legacy audit. Not blind or MiniLM A/B evidence.',newPaths,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks};
fs.mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../reports/semantic_planning_tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,checks:undefined},null,2));if(report.failed)process.exitCode=1;
