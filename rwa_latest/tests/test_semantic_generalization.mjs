/** Focused v6.3 generalization evidence. Developer-authored, not a blind MiniLM benchmark. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RwaQaEngine} from '../rwa_engine.js';
import {parseRuleText} from '../semantic/registry.js';
import {loadFixtures} from '../tools/evaluate.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=parseRuleText(read('command_patterns.txt')),data=loadFixtures(),catalog=JSON.parse(read('rwa_sample_data.txt'));
const make=(mode='guarded')=>new RwaQaEngine(data.rows,{...data,commandPatterns:registry,semanticCatalog:catalog,portfolioComplete:true,compositionMode:mode});
const checks=[];function test(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
const lexical=[
 ['What fueled Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA','fuel',true],
 ['What fuelled Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA','fuel',true],
 ['What fuels Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA','fuel',true],
 ['What lay behind Samsung RWA increase in July 2026?','GROUP_ROOT_CAUSE','CAUSE','lay behind',false],
 ['What pushed Samsung RWA higher in July 2026?','GROUP_ROOT_CAUSE','CAUSE_LEMMA','push',true],
 ['Has Samsung RWA surged in July 2026?','MOVEMENT_CHECK','RISE_LEMMA','surge',true],
 ['Has Samsung RWA soared in July 2026?','MOVEMENT_CHECK','RISE_LEMMA','soar',true],
 ['Has Samsung RWA accelerated in July 2026?','MOVEMENT_CHECK','RISE_LEMMA','accelerate',true],
 ['Has Samsung RWA dipped in July 2026?','MOVEMENT_CHECK','FALL_LEMMA','dip',true],
 ['Has Samsung RWA plunged in July 2026?','MOVEMENT_CHECK','FALL_LEMMA','plunge',true],
 ['Has Samsung RWA tumbled in July 2026?','MOVEMENT_CHECK','FALL_LEMMA','tumble',true]
];
for(const [q,action,family,lemma,derived] of lexical)test('Lexical abstraction '+q,()=>{
 const guarded=make(),off=make('off'),a=guarded.parseQuestion(q);assert.equal(a.ok,true,a.message);assert.equal(a.plan.action,action);
 const old=off.parseQuestion(q),ev=a.explain.composition?.frame?.lexicalEvidence||[];
 if(!old.ok){assert.ok(ev.some(x=>x.family===family&&x.lemma===lemma&&x.derived===derived),JSON.stringify(ev));const hit=ev.find(x=>x.family===family);assert.ok(Array.isArray(hit.abstractionPath)&&hit.abstractionPath.length>=2);guarded.parser.dictionary.resolve(hit.text).matches.filter(m=>m.start===0&&m.end===hit.text.length).forEach(m=>assert.notEqual(m.source?.file,'lexical_families.csv'));assert.equal(guarded.parser.lastComposition?.decision,'COMPOSED_CANDIDATE');}
 else assert.equal(a.ok,true);
});
test('Compatible exact subphrase ownership allows a longer reviewed abstraction',()=>{
 const e=make(),a=e.parseQuestion('What lay behind Samsung RWA increase in July 2026?');assert.equal(a.ok,true);const ev=a.explain.composition.frame.lexicalEvidence.find(x=>x.text==='lay behind');assert.ok(ev);assert.equal(ev.family,'CAUSE');
});
test('Conflicting protected phrase ownership is still not stolen',()=>{
 const e=make();e.parseQuestion('Explain Samsung RWA increase in July 2026');const d=e.parser.dictionary;
 // Exact driver phrase remains protected even though the surface may contain ordinary English words.
 const prepared=d.resolve('driven by');assert.ok(prepared.matches.some(x=>x.concept==='DRIVER'));
});
test('Guarded consistency gate blocks undefined net/gross while shadow preserves legacy',()=>{
 for(const word of ['net','gross']){const q=`Why has Samsung RWA risen in July 2026 ${word}?`,g=make(),s=make('shadow');assert.equal(s.answer(q).ok,true);const a=g.answer(q);assert.equal(a.ok,false);assert.equal(a.code,'AMBIGUOUS_SEMANTIC_BINDING');assert.ok(g.parser.lastSemanticAudit.findings.some(x=>x.code==='UNDEFINED_AGGREGATION_BASIS'));}
});
test('Candidate graph is bounded and exposes competing reviewed interpretations',()=>{
 const e=make(),q='Show top 5 groups by RWA increase with RWA balance above 25m in July 2026',a=e.parseQuestion(q);assert.equal(a.ok,false);assert.equal(a.code,'AMBIGUOUS_SEMANTIC_BINDING');const graph=e.parser.lastSemanticAudit.candidateGraph;assert.ok(graph.candidates.length>=2&&graph.candidates.length<=registry.composition.maxCandidates);assert.ok(graph.disagreements.some(x=>x.material));
});
test('Reference plus month replacement resolves one prior ranked ID atomically',()=>{
 const e=make();assert.equal(e.answer('Show top 5 groups by RWA increase in July 2026').ok,true);const expected=e.state.references[1];const before=JSON.stringify(e.state);const p=e.parseQuestion('What about the second one, but in June 2026?');assert.equal(p.ok,true,p.message);assert.equal(JSON.stringify(e.state),before);assert.equal(p.plan.groupId,expected.kind==='GROUP'?expected.id:expected.parentId);assert.equal(p.plan.period.month,'2026-06');assert.equal(p.explain.semanticPlanning.shape,'REFERENCE_CONTEXT');
});
const report={scope:'Developer-authored lexical abstraction, productive morphology, compatible phrase ownership, bounded candidate graph, consistency gate and reference composition. Not a blind MiniLM comparison.',passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks};
fs.mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../reports/semantic_generalization_tests.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,checks:undefined},null,2));if(report.failed)process.exitCode=1;
