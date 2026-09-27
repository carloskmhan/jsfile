/** Bounded typo recovery, not classification. Candidates are reviewed literals, never learned. */
import {tokenize,norm,overlaps} from './text.js';
import {GRAMMAR_GLUE} from './validation.js';
const SAFE_CONCEPTS=new Set('ROOT DRIVER MAIN AMOUNT RANK COMPARE TREND PEAK OFFSETS RECONCILE CONCENTRATION INCREASE DECREASE BALANCE PERCENT ABSOLUTE ENTITY GROUP PRODUCT LOCATION BRIEF DETAIL'.split(' '));
/** Optimal string alignment distance: insertion/deletion/substitution/transposition have unit cost. */
export function editDistance(a,b){
  if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
  let prev2=null,prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row=[i];for(let j=1;j<=b.length;j++){
      row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(prev2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],prev2[j-2]+1);
    }prev2=prev;prev=row;
  }return prev[b.length];
}
const caches=new WeakMap();
function indexFor(dict){
  if(caches.has(dict))return caches.get(dict);
  const registry=dict.registry,entries=[],reserved=new Set(['usd','rwa','cg','ead','pd','lgd','crm','fx',...GRAMMAR_GLUE]);
  for(const r of [...registry.units,...registry.temporal])for(const t of tokenize(r.phrase))reserved.add(t.text);
  for(const s of registry.synonyms)if(s.enabled&&/^[a-z]+$/.test(s.phrase)&&s.phrase.length>=5&&SAFE_CONCEPTS.has(s.concept)&&!reserved.has(s.phrase))entries.push({category:'semantic_word',candidate:s.phrase,canonical:s.concept,key:'concept:'+s.concept,source:s.source});
  // Only names already supplied by the authorised runtime catalog are candidates.
  for(const identity of dict.identities)for(const alias of identity.aliases){
    const candidate=norm(alias),full=norm(identity.name),base=full.replace(/(?:\s+(?:group|inc|incorporated|limited|ltd|plc|corporation|corp|co))+$/u,'').trim();
    const priority=candidate===norm(identity.id)?100:candidate===full?80:candidate===base?60:candidate.includes(' ')?40:20;
    if(/^[a-z]+$/.test(candidate)&&candidate.length>=5&&candidate.length<=48&&!reserved.has(candidate))entries.push({category:'entity',priority,candidate,canonical:identity.id,key:identity.key,source:{file:dict.source||'runtime_catalog'}});
  }
  // Same spelling: honour the SAME finite display-name priority as exact lookup.
  // Different equally plausible spellings or same-priority IDs remain ambiguous.
  const priorities=new Map();for(const e of entries)if(e.category==='entity')priorities.set(e.candidate,Math.max(priorities.get(e.candidate)||0,e.priority));
  const keys=new Set();const index=new Map();for(const entry of entries){if(entry.category==='entity'&&entry.priority<priorities.get(entry.candidate))continue;const key=entry.category+'|'+entry.candidate+'|'+entry.key;if(keys.has(key))continue;keys.add(key);const n=entry.candidate.length;if(!index.has(n))index.set(n,[]);index.get(n).push(entry);}
  const value={index,reserved};caches.set(dict,value);return value;
}
/** Money/date/ID contexts are never generic typo recovery inputs. */
function protectedContext(text,token,registry){
  const before=text.slice(0,token.start),after=text.slice(token.end);
  if(/[\d$%,.]+\s*$/.test(before)||/^\s*[\d%]/.test(after))return 'NUMBER_UNIT_OR_DATE_CONTEXT';
  if(registry.temporal.some(d=>d.enabled&&d.kind==='MONTH'&&Math.abs(d.phrase.length-token.text.length)<=1&&editDistance(d.phrase,token.text)<=1))return 'DATE_LIKE_TOKEN';
  if(/\b(?:month|quarter|year)\s*$/.test(before)||/^\s*(?:month|quarter|year)\b/.test(after))return 'TEMPORAL_CONTEXT';
  return null;
}
export function recoverTypos(text,dict,lex,{disabled=false}={}){
  const registry=dict.registry,{index,reserved}=indexFor(dict),configs=Object.fromEntries(registry.fuzzyConfig.map(c=>[c.category,c]));
  const attempts=[],corrections=[],used={semantic_word:0,entity:0};
  const blocked=[...lex.names,...lex.matches];
  const unknown=tokenize(text).filter(t=>/^[a-z]+$/.test(t.text)&&!reserved.has(t.text)&&!blocked.some(s=>overlaps(s,t)));
  const result=(error=null)=>({text,attempts,corrections,error});
  if(disabled)return {...result(),disabled:true};
  if(unknown.length>registry.settings.max_fuzzy_unmatched_tokens)return result({code:'UNSUPPORTED_EXPRESSION',message:'Too many unrecognised tokens for bounded typo recovery.'});
  for(const token of unknown){
    const reason=token.text.length<5?'SHORT_TOKEN_FORBIDDEN':protectedContext(text,token,registry);
    if(reason){attempts.push({input:token.text,accepted:false,reason,start:token.start,end:token.end});continue;}
    if(token.text.length>48){attempts.push({input:token.text,accepted:false,reason:'TOKEN_TOO_LONG'});continue;}
    const candidates=[];
    const poolCount=Array.from({length:5},(_,i)=>(index.get(token.text.length-2+i)||[]).length).reduce((a,b)=>a+b,0);
    if(poolCount>10000){attempts.push({input:token.text,accepted:false,reason:'CANDIDATE_LIMIT_USE_EXACT_ID'});continue;}
    for(let size=Math.max(5,token.text.length-2);size<=token.text.length+2;size++)for(const entry of index.get(size)||[]){
      const cfg=configs[entry.category];if(!cfg?.enabled||Math.min(size,token.text.length)<cfg.min_length)continue;
      const distance=editDistance(token.text,entry.candidate);if(distance>2)continue;
      const similarity=1-distance/Math.max(size,token.text.length);
      candidates.push({...entry,distance,similarity,qualifies:distance<=cfg.max_edits&&similarity+1e-12>=cfg.threshold,threshold:cfg.threshold});
    }
    candidates.sort((a,b)=>b.similarity-a.similarity||a.candidate.localeCompare(b.candidate)||a.key.localeCompare(b.key));
    const best=candidates[0];
    if(!best){attempts.push({input:token.text,accepted:false,reason:'NO_KNOWN_CANDIDATE',start:token.start,end:token.end});continue;}
    const other=candidates.find(c=>c.key!==best.key),cfg=configs[best.category];
    const log={input:token.text,candidate:best.candidate,canonical:best.canonical,category:best.category,similarity:best.similarity,distance:best.distance,source:best.source,threshold:cfg.threshold,start:token.start,end:token.end,candidates:candidates.slice(0,3)};
    if(!best.qualifies){attempts.push({...log,accepted:false,reason:best.distance>cfg.max_edits?'EDIT_LIMIT':'BELOW_THRESHOLD'});continue;}
    if(other&&best.similarity-other.similarity<Math.max(cfg.min_margin,configs[other.category].min_margin)-1e-12){
      attempts.push({...log,accepted:false,reason:'AMBIGUOUS_CANDIDATES'});
      return result({code:best.category==='entity'||other.category==='entity'?'AMBIGUOUS_ENTITY':'AMBIGUOUS_FUZZY',message:'The typo has more than one plausible known correction. Use an exact name or expression.'});
    }
    if(used[best.category]>=cfg.max_corrections){attempts.push({...log,accepted:false,reason:'MAX_CORRECTIONS'});return result({code:'UNSUPPORTED_EXPRESSION',message:'Too many corrections would be required. Rephrase with exact names and numbers.'});}
    used[best.category]++;corrections.push({...log,accepted:true,reason:'TYPO_RECOVERY_ONLY'});attempts.push(corrections.at(-1));
  }
  let corrected=text;for(const c of [...corrections].sort((a,b)=>b.start-a.start))corrected=corrected.slice(0,c.start)+c.candidate+corrected.slice(c.end);
  return {text:corrected,attempts,corrections,error:null};
}
