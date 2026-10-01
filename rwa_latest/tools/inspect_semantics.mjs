/** Local synthetic parse-only inspection. Does not execute a report or contact Tableau. */
import fs from 'node:fs';
import {RwaQaEngine} from '../rwa_engine.js';
import {loadFixtures} from './evaluate.mjs';
import {parseRuleText} from '../semantic/registry.js';
const q=process.argv.slice(2).join(' ').trim();
if(!q){console.error('Usage: node tools/inspect_semantics.mjs "<RWA question>"');process.exitCode=2;}
else{
 const data=loadFixtures(),read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const e=new RwaQaEngine(data.rows,{...data,semanticCatalog:JSON.parse(read('rwa_sample_data.txt')),commandPatterns:parseRuleText(read('command_patterns.txt')),compositionMode:'guarded',portfolioComplete:true});
 const parsed=e.parseQuestion(q);
 console.log(JSON.stringify({scope:'Synthetic parse-only inspection; no report was executed.',accepted:parsed.ok,code:parsed.code||'ACCEPT',message:parsed.message,plan:parsed.plan,
  meaning:e.parser.lastSemanticPlan,audit:e.parser.lastSemanticAudit,lexical:e.parser.lastComposition},null,2));
}
