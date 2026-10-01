/** Full behavior snapshots, not just nonempty gold slots. No customer data: synthetic fixtures only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseCsv} from '../csv_adapter.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASELINE='af44159f4ce854833eee1611b24b52b1b65f9100';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function clean(result){
  const copy=JSON.parse(JSON.stringify(result));
  // Sole volatile field in parse/answer output. Everything else is compared.
  if(copy?.explain)delete copy.explain.latencyMs;
  return copy;
}
export async function behaviorSnapshots(root,mode='off'){
  const {RwaQaEngine}=await import(pathToFileURL(path.join(root,'rwa_engine.js')));
  const {parseRuleText}=await import(pathToFileURL(path.join(root,'semantic/registry.js')));
  const {loadFixtures}=await import(pathToFileURL(path.join(root,'tools/evaluate.mjs')));
  const {planDataRequest}=await import(pathToFileURL(path.join(root,'semantic/routing.js')));
  const data=loadFixtures(),cat=JSON.parse(fs.readFileSync(path.join(root,'rwa_sample_data.txt'),'utf8'));
  const registry=parseRuleText(fs.readFileSync(path.join(root,'command_patterns.txt'),'utf8'));
  const engine=new RwaQaEngine(data.rows,{...data,commandPatterns:registry,semanticCatalog:cat,portfolioComplete:true,compositionMode:mode});
  const cases=[];
  for(const corpus of ['questions.csv','robustness.csv']){
    let conversation=null;
    for(const test of parseCsv(fs.readFileSync(path.join(root,'tests',corpus),'utf8'))){
      if(test.conversation_id!==conversation){engine.reset();conversation=test.conversation_id;}
      const context={selectedClientGroup:test.context_group||undefined,selectedEntity:test.context_entity||undefined,selectedMonth:test.context_month||undefined};
      const before=JSON.stringify(engine.state);
      const parsed=engine.parseQuestion(test.question,context);
      if(before!==JSON.stringify(engine.state))throw new Error('Parse mutated state: '+test.id);
      const routing=planDataRequest(test.question,cat,registry,engine.state,context);
      const answer=engine.answer(test.question,context);
      if(!answer.ok&&before!==JSON.stringify(engine.state))throw new Error('Rejected request mutated state: '+test.id);
      const behavior={parsed:clean(parsed),answer:clean(answer),state:engine.state,routing};
      cases.push({corpus,id:test.id,sha256:sha(JSON.stringify(canonical(behavior)))});
    }
  }
  return cases;
}
async function main(){
  const output=path.join(ROOT,'tests/composition_legacy_snapshots.json');
  if(process.argv.includes('--capture-baseline')){
    const i=process.argv.indexOf('--baseline-root'),baseline=process.argv[i+1];
    if(i<0||!baseline||path.resolve(baseline)===ROOT)throw new Error('Capture requires a separate unchanged baseline checkout.');
    const r=JSON.parse(fs.readFileSync(path.join(baseline,'command_patterns.txt'),'utf8').replace(/^(?:#[^\n]*\n)+/,''));
    if(r.composition)throw new Error('Cannot bless composition output as legacy baseline.');
    const cases=await behaviorSnapshots(path.resolve(baseline));
    const sourcePaths=['command_patterns.txt','rwa_engine.js','historical_peaks.js','semantic/engine.js','tests/questions.csv','tests/robustness.csv','tests/fixture.json'];
    fs.writeFileSync(output,JSON.stringify({baselineCommit:BASELINE,
      excludedFields:['parsed.explain.latencyMs','answer.explain.latencyMs'],
      sourceHashes:Object.fromEntries(sourcePaths.map(p=>[p,sha(fs.readFileSync(path.join(baseline,p)))])),cases},null,2)+'\n');
    console.log('Captured',cases.length,'full legacy behaviors from separate source.');return;
  }
  const expected=JSON.parse(fs.readFileSync(output,'utf8'));
  if(expected.baselineCommit!==BASELINE||expected.cases.length!==851)throw new Error('Unexpected baseline manifest.');
  for(const p of ['tests/questions.csv','tests/robustness.csv','tests/fixture.json'])
    if(sha(fs.readFileSync(path.join(ROOT,p)))!==expected.sourceHashes[p])throw new Error('Protected fixture changed: '+p);
  const modes=[];
  for(const mode of ['off','shadow','guarded']){
    const actual=await behaviorSnapshots(ROOT,mode);
    const differences=actual.filter((r,i)=>r.id!==expected.cases[i]?.id||r.corpus!==expected.cases[i]?.corpus||r.sha256!==expected.cases[i]?.sha256);
    modes.push({mode,total:actual.length,passed:actual.length-differences.length,failed:differences.length,differences});
  }
  const report={baselineCommit:BASELINE,scope:'Exact parse, result, warnings, answer, state and authorised routing; only explain.latencyMs excluded.',modes};
  fs.writeFileSync(path.join(ROOT,'reports/composition_regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(modes.some(m=>m.failed))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
