/** Gold values never select the baseline's parameters; absent fields stay unobserved. */
import fs from 'node:fs';import {parseCsv} from '../csv_adapter.js';import {actualFields,compareGold,metrics,loadFixtures,validateCases} from './evaluate.mjs';
const [corpus,file]=process.argv.slice(2),cases=validateCases(parseCsv(fs.readFileSync(corpus,'utf8'))),report=JSON.parse(fs.readFileSync(file,'utf8')),data=loadFixtures();
const groups=new Map(Object.entries(report.identityMappings.groups)),entities=new Map(Object.entries(report.identityMappings.entities));
function baselineFields(r){const p=r.parsed||{},base=actualFields(null);return {...base,expected_action:p.intent||null,expected_group_id:p.intent==='TOP_CLIENTS'?null:groups.get(p.clientGroup)||p.clientGroup||null,expected_entity_id:entities.get(p.clientGroup+'\0'+p.entity)||p.entity||null,expected_period:p.period?.month||p.period?.end||null,expected_driver:p.driver||null,expected_top_n:p.topN??null};}
report.results={};report.metrics={};report.observability={};report.rawRequiredContractMetrics={};
for(const engine of ['rule','minilm']){
 const by=new Map(report.predictions.filter(p=>p.engine===engine).map(p=>[p.id,p]));
 const rows=cases.map(c=>{const r=by.get(c.id)||{},actual=engine==='rule'?actualFields(r.plan):baselineFields(r),checks=compareGold(c,actual),accepted=!!r.accepted;return {...c,exactGold:c.exact_gold==='true',accepted,code:r.code||'ERROR',correct:c.expected_status==='ACCEPT'?accepted&&checks.every(x=>x.correct):c.expected_status==='AMBIGUOUS'?!accepted&&r.code?.startsWith('AMBIGUOUS'):!accepted,checks,actual,latencyMs:r.parseMs,totalLatencyMs:r.totalMs,executed:r.executed};});
 report.results[engine]=rows;report.metrics[engine]=metrics(rows);report.rawRequiredContractMetrics[engine]=metrics(rows);
 const exposed=engine==='rule'?new Set(Object.keys(actualFields({}))):new Set(['expected_action','expected_group_id','expected_entity_id','expected_period','expected_driver','expected_top_n']);
 const observable=rows.flatMap(r=>r.checks).filter(c=>exposed.has(c.field));
 report.observability[engine]={observedSlotMatches:observable.filter(c=>c.correct).length,observedSlotAssertions:observable.length,observableSlotAccuracy:observable.length?observable.filter(c=>c.correct).length/observable.length:null,unobservableAssertions:rows.flatMap(r=>r.checks).filter(c=>!exposed.has(c.field)).length,definition:'Full-plan metrics count missing fields as unmatched requirements. This auxiliary measure excludes fields the baseline does not expose; not evidence that missing constraints were applied.'};
 if(engine==='minilm'){
  const unavailable=['supportedFullPlanAccuracy','followupContextAccuracy','typoRecoveryAccuracy','entityFuzzyAccuracy','endToEndExactMatch','wrongExecutableCommandRate'];
  for(const name of unavailable){const raw=report.metrics[engine][name];report.metrics[engine][name]={rate:null,status:'NOT_FULLY_OBSERVABLE',requiredCaseCount:raw.total??raw.denominator,rawRequiredContract:raw,reason:'The preserved baseline does not expose all gold fields. A nonverified contract is not proof that every numerical answer was wrong; do not report 0% intrinsic MiniLM ability.'};}
 }

}
fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({metrics:report.metrics,observability:report.observability,timing:report.timing},null,2));
