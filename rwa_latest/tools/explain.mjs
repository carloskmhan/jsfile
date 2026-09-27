/** Parse one question without changing conversation state; no model or network. */
import fs from 'node:fs';import path from 'node:path';import {RwaQaEngine} from '../rwa_engine.js';import {parseRuleText} from '../semantic/registry.js';import {ROOT,loadFixtures} from './evaluate.mjs';
const q=process.argv[2];if(!q){console.error('Usage: node tools/explain.mjs "What drove Samsung RWA higher in July?" [GROUP_NAME] [YYYY-MM]');process.exit(2);}
const d=loadFixtures(),engine=new RwaQaEngine(d.rows,{...d,portfolioComplete:true,semanticCatalog:JSON.parse(fs.readFileSync(path.join(ROOT,'rwa_sample_data.txt'),'utf8')),commandPatterns:parseRuleText(fs.readFileSync(path.join(ROOT,'command_patterns.txt'),'utf8'))});
console.log(JSON.stringify(engine.parseQuestion(q,{selectedClientGroup:process.argv[3]||'SAMSUNG GROUP',selectedMonth:process.argv[4]||'2026-06'}),null,2));
