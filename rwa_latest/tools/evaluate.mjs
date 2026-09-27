/** Full-plan metrics, not one aggregate accuracy. Usage: node tools/evaluate.mjs [corpus.csv] [report.json] */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {RwaQaEngine} from '../rwa_engine.js';import {parseRuleText} from '../semantic/registry.js';import {parseCsv} from '../csv_adapter.js';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function keyPeriod(p){return !p?null:p.mode==='month'?p.month:p.mode==='comparison'?p.months.join('|'):p.mode==='window'?p.start+'..'+p.end:'history:'+p.end;}
export function actualFields(plan){return {
 expected_action:plan?.action??null,expected_group_id:plan?.groupId??null,expected_entity_id:plan?.entityId??null,expected_period:keyPeriod(plan?.period),expected_metric:plan?.metric??null,expected_direction:plan?.direction??null,expected_top_n:plan?.topN??null,expected_driver:plan?.driver??null,
 expected_excluded_groups:plan?.excludedGroupIds?.join('|')||null,expected_excluded_entities:plan?.excludedEntityIds?.join('|')||null,expected_excluded_drivers:plan?.excludedDrivers?.join('|')||null,expected_comparison_ids:plan?.comparisonIds?.join('|')||null,
 expected_threshold_op:plan?.condition?.op??null,expected_threshold_value:plan?.condition?.value??null,expected_threshold_metric:plan?.condition?.metric??null,expected_threshold_canonical:plan?.condition?.canonicalValue??null,expected_threshold_unit:plan?.condition?.unit??null,
 expected_dimension:plan?.dimension??null,expected_candidate_groups:plan?.candidateGroupIds?.join('|')||null,expected_candidate_entities:plan?.candidateEntityIds?.join('|')||null,expected_check_mode:plan?.checkMode??null,expected_negated:plan?!!plan.negatedCheck:null,expected_peer:plan?!!plan.peer:null,expected_concise:plan?!!plan.concise:null,expected_response_variant:plan?.responseVariant??null
 };}
export function compareGold(test,actual){return Object.entries(actual).filter(([k])=>test[k]!==''&&test[k]!=null).map(([field,value])=>({field,expected:test[field]==='~'?null:String(test[field]),actual:value==null?null:String(value),correct:(test[field]==='~'?null:String(test[field]))===(value==null?null:String(value))}));}
export function metrics(results){
 const supported=results.filter(r=>r.expected_status==='ACCEPT'),rejected=results.filter(r=>r.expected_status==='REJECT'),ambiguous=results.filter(r=>r.expected_status==='AMBIGUOUS'),fields=results.flatMap(r=>r.checks);
 const ratio=(items,fn)=>({correct:items.filter(fn).length,total:items.length,rate:items.length?items.filter(fn).length/items.length:null});
 const errorRate=(items,fn)=>({numerator:items.filter(fn).length,denominator:items.length,rate:items.length?items.filter(fn).length/items.length:null});
 const of=names=>fields.filter(x=>names.includes(x.field));
 const lat=results.map(r=>r.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b),q=n=>lat.length?lat[Math.min(lat.length-1,Math.floor(n*(lat.length-1)))]:null;
 const entities=of(['expected_group_id','expected_entity_id','expected_comparison_ids']);
 return {intentAccuracy:ratio(of(['expected_action']),x=>x.correct),entityAccuracy:ratio(entities,x=>x.correct),periodAccuracy:ratio(of(['expected_period']),x=>x.correct),slotAccuracy:ratio(fields,x=>x.correct),supportedFullPlanAccuracy:ratio(supported,x=>x.correct),followupContextAccuracy:ratio(supported.filter(x=>+x.turn>1),x=>x.correct),unsupportedRejectionAccuracy:ratio(rejected,x=>!x.accepted),falsePositiveRate:{numerator:rejected.filter(x=>x.accepted).length,denominator:rejected.length,rate:rejected.length?rejected.filter(x=>x.accepted).length/rejected.length:null},ambiguityHandlingAccuracy:ratio(ambiguous,x=>!x.accepted&&x.code?.startsWith('AMBIGUOUS')),numberUnitAccuracy:ratio(of(['expected_threshold_value','expected_threshold_canonical','expected_threshold_unit','expected_top_n']),x=>x.correct),relationAccuracy:ratio(of(['expected_comparison_ids','expected_excluded_groups','expected_excluded_entities']),x=>x.correct),negationModifierAccuracy:ratio(of(['expected_threshold_op','expected_excluded_drivers','expected_negated','expected_check_mode']),x=>x.correct),typoRecoveryAccuracy:ratio(supported.filter(r=>r.category?.startsWith('TYPO')),x=>x.correct),entityFuzzyAccuracy:ratio(supported.filter(r=>r.category==='TYPO_ENTITY'),x=>x.correct),fuzzyFalsePositiveRate:errorRate(rejected.filter(r=>r.category==='FUZZY_NEGATIVE'),x=>x.accepted),overallFalsePositiveCommandRate:errorRate([...rejected,...ambiguous],x=>x.accepted),endToEndExactMatch:ratio(supported.filter(r=>r.exactGold),x=>x.correct),wrongExecutableCommandRate:errorRate(results.filter(r=>r.accepted),x=>!x.correct),parsingLatencyMs:{samples:lat.length,p50:q(.5),p95:q(.95),max:q(1)}};
}
export function validateCases(cases){
 if(!cases.length)throw new Error('No evaluation rows. Fill the empty holdout template before running it.');
 const ids=new Set(),closed=new Set();let conv=null,turn=0;
 for(const c of cases){
  if(!c.id||ids.has(c.id))throw new Error('Missing/duplicate test ID: '+c.id);ids.add(c.id);
  if(!c.question||!c.conversation_id||!['ACCEPT','REJECT','AMBIGUOUS'].includes(c.expected_status))throw new Error('Invalid question/conversation/expected_status at '+c.id);
  if(c.exact_gold==='true'&&c.expected_status==='ACCEPT'){for(const k of Object.keys(actualFields(null)))if(c[k]===''||c[k]==null)throw new Error('Exact gold is missing '+k+' at '+c.id);}
  if(c.expected_status==='ACCEPT'&&!c.expected_action)throw new Error('Accepted cases need expected_action: '+c.id);
  if(c.conversation_id!==conv){if(conv)closed.add(conv);if(closed.has(c.conversation_id))throw new Error('Conversation rows must be contiguous: '+c.id);conv=c.conversation_id;turn=0;}
  if(Number(c.turn)!==++turn)throw new Error('Conversation turns must begin at 1 and increment: '+c.id);
 }
 return cases;
}
export function loadFixtures(){
 const data=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixture.json'),'utf8'));
 // Clearly synthetic Aug rows let the three-turn user scenario complete; never added to live/sample source.
 const august=data.rows.filter(r=>r.client_group==='TOYOTA GROUP'&&r.month==='2026-07').map((r,i)=>({...r,month:'2026-08',rwa_prev:r.rwa_curr,rwa_curr:r.rwa_curr+30+i*10,drivers:{CG:10,EAD:20+i*10,FX:0,Maturity:0}}));
 return {...data,rows:[...data.rows,...august]};
}
export function evaluate(corpusFile,reportFile,options={}){
 const source=fs.readFileSync(corpusFile,'utf8'),cases=validateCases(parseCsv(source)),reg=parseRuleText(fs.readFileSync(path.join(ROOT,'command_patterns.txt'),'utf8')),data=loadFixtures(),cat=JSON.parse(fs.readFileSync(path.join(ROOT,'rwa_sample_data.txt'),'utf8'));
 const start=performance.now(),engine=new RwaQaEngine(data.rows,{...data,commandPatterns:reg,semanticCatalog:cat,portfolioComplete:true,disableFuzzy:!!options.disableFuzzy}),initMs=performance.now()-start;
 let conv=null;const results=[];
 for(const test of cases){
  if(test.conversation_id!==conv){engine.reset();conv=test.conversation_id;}
  const context={selectedClientGroup:test.context_group||undefined,selectedEntity:test.context_entity||undefined,selectedMonth:test.context_month||undefined};
  const t=performance.now(),parsed=engine.parseQuestion(test.question,context),latencyMs=performance.now()-t;
  const actual=actualFields(parsed.plan),checks=compareGold(test,actual);
  let code=parsed.code||'ACCEPT',executed=false,dataError=null;
  if(parsed.ok){const answer=engine.answer(test.question,context);executed=answer.ok;if(!executed)dataError=answer.answer;}
  const accepted=parsed.ok,correct=test.expected_status==='ACCEPT'?accepted&&checks.every(x=>x.correct):test.expected_status==='AMBIGUOUS'?!accepted&&code.startsWith('AMBIGUOUS'):!accepted;
  results.push({id:test.id,category:test.category||'legacy',exactGold:test.exact_gold==='true',conversation_id:test.conversation_id,turn:+test.turn,question:test.question,split:test.split,expected_status:test.expected_status,accepted,code,correct,checks,actual,latencyMs,executed,dataError,failureCategory:parsed.explain?.failureCategory||null,fuzzy:parsed.explain?.fuzzy||null,diagnostic:correct?undefined:{message:parsed.message,unknown:parsed.explain?.unknownTokens,candidates:parsed.explain?.candidates?.slice(0,2)}});
 }
 const categories=Object.fromEntries([...new Set(results.map(r=>r.category))].map(c=>[c,metrics(results.filter(r=>r.category===c))]));
 const failures=results.filter(r=>!r.correct).map(r=>({id:r.id,question:r.question,code:r.code,layer:r.failureCategory||r.checks.find(c=>!c.correct)?.field?.replace('expected_','').toUpperCase()||'INTENT',mismatches:r.checks.filter(c=>!c.correct),diagnostic:r.diagnostic}));
 const runtimePaths=[...fs.readdirSync(ROOT).filter(x=>x.endsWith('.js')),...fs.readdirSync(path.join(ROOT,'semantic')).filter(x=>x.endsWith('.js')).map(x=>'semantic/'+x),'command_patterns.txt'].sort();
 const runtimeHashes=Object.fromEntries(runtimePaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')]));
 const report={executionSummary:{acceptedPlans:results.filter(r=>r.accepted).length,answered:results.filter(r=>r.accepted&&r.executed).length,blockedAfterParse:results.filter(r=>r.accepted&&!r.executed).map(r=>({id:r.id,question:r.question,reason:r.dataError})),note:'Parsing exact-match and actual answer production are separate. Missing data must stop execution and cannot be replaced by an old result.'},runtimeHashes,categoryMetrics:categories,failures,fuzzyDisabled:!!options.disableFuzzy,suite:'Manual deterministic semantic rules - developer regression; NOT independent accuracy or MiniLM superiority',measurementScope:'Command + explicit gold parameters before execution; execution/data availability reported separately. Latency measures parseQuestion only after fixture construction.',corpusSha256:crypto.createHash('sha256').update(source).digest('hex'),ruleSourceSha256:reg.sourceSha256,initialConstructorMs:initMs,node:process.version,total:results.length,passed:results.filter(r=>r.correct).length,failed:results.filter(r=>!r.correct).length,metrics:metrics(results),memory:{measurement:'process.memoryUsage after evaluation; includes fixtures and reporting, not isolated engine memory',...process.memoryUsage()},results};
 fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined},null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--require-holdout')){const i=process.argv.indexOf('--holdout-manifest'),manifest=process.argv[i+1];if(i<0||!manifest)throw new Error('--require-holdout requires --holdout-manifest');const r=spawnSync(process.env.PYTHON||'python',['tools/holdout_guard.py','verify','--corpus',process.argv[2],'--manifest',manifest],{cwd:ROOT,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout||'Holdout verification failed');}
 const report=evaluate(path.resolve(process.argv[2]||path.join(ROOT,'tests/questions.csv')),path.resolve(process.argv[3]||path.join(ROOT,'reports/semantic_regression.json')),{disableFuzzy:process.argv.includes('--disable-fuzzy')});process.exitCode=report.failed?1:0;
}
