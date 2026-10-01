/** Deterministically generated numeric properties. NOT unseen-user or blind language evidence. */
import fs from 'node:fs';import assert from 'node:assert/strict';
import {RwaQaEngine} from '../rwa_engine.js';import {parseRuleText} from '../semantic/registry.js';import {indexRowsToCatalog} from '../group_catalog.js';
const registry=parseRuleText(fs.readFileSync(new URL('../command_patterns.txt',import.meta.url),'utf8'));
let seed=16202026;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const catalog=indexRowsToCatalog(Array.from({length:24},(_,i)=>({client_group_id:String(i+1).padStart(4,'0'),client_group_name:'SYNTHETIC '+String(i+1).padStart(2,'0')+' GROUP'})));
const rows=catalog.groups.flatMap(g=>['2026-06','2026-07'].map(month=>{const prev=10+Math.floor(random()*180),delta=-15+Math.floor(random()*160);return{client_group_id:g.client_group_id,client_group:g.client_group_name,entity_id:'E'+g.client_group_id,entity:'SYNTHETIC ENTITY '+g.client_group_id,month,rwa_prev:prev,rwa_curr:prev+delta,drivers:{EAD:delta*.7,FX:delta*.3}};}));
const checks=[];function test(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
const make=reg=>new RwaQaEngine(rows,{commandPatterns:reg||registry,semanticCatalog:catalog,compositionMode:'guarded',portfolioComplete:true});
const predicates={below:(x,b)=>x<b,above:(x,b)=>x>b,'at most':(x,b)=>x<=b,'at least':(x,b)=>x>=b};
for(const month of ['2026-06','2026-07'])for(const [word,predicate]of Object.entries(predicates))for(const bound of [0,25,75,150])for(const limit of [1,3,7]){
 const q=`Show top ${limit} groups by RWA percentage increase excluding groups with RWA ${word} ${bound}m in ${month}`;
 test(month+' '+word+' '+bound+' top '+limit,()=>{
  const e=make(),a=e.answer(q);assert.equal(a.ok,true,a.answer);
  const expected=rows.filter(r=>r.month===month&&r.rwa_curr-r.rwa_prev>1e-9&&!predicate(r.rwa_curr,bound)).map(r=>({...r,rate:(r.rwa_curr-r.rwa_prev)/r.rwa_prev})).sort((a,b)=>b.rate-a.rate||a.client_group.localeCompare(b.client_group)).slice(0,limit);
  assert.equal(a.plan.metric,'PERCENT');assert.equal(a.plan.condition.metric,'BALANCE');assert.deepEqual(a.result.items.map(x=>x.groupId),expected.map(x=>x.client_group_id));
  a.result.items.forEach((x,i)=>{assert.ok(Math.abs(x.value-100*expected[i].rate)<1e-8);assert.equal(x.rwa_curr,expected[i].rwa_curr);});
 });
}
test('Unchanged command-margin gate is mandatory',()=>{const r=structuredClone(registry);r.commands.find(c=>c.action==='TOP_CLIENTS').min_margin=1;const e=make(r);assert.equal(e.answer('Show top 3 groups by percentage increase excluding groups with RWA below 25m in July 2026').ok,false);assert.deepEqual(e.state,{});});
test('Disabled executor cannot be recovered from a meaning frame',()=>{const r=structuredClone(registry);r.commands.find(c=>c.action==='TOP_CLIENTS').enabled=false;const e=make(r);assert.equal(e.answer('Show top 3 groups by percentage increase excluding groups with RWA below 25m in July 2026').ok,false);assert.deepEqual(e.state,{});});
const report={scope:'Seeded synthetic numeric properties; independent arithmetic expectations, not blind language or MiniLM A/B performance.',seed:16202026,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks};
fs.mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../reports/planning_properties.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,checks:undefined},null,2));if(report.failed)process.exitCode=1;
