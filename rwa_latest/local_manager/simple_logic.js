/** Management-only helpers. All interpretations use the unchanged real engine.
 * A manual choice proposes a CSV synonym/patch, never bypasses parser validation.
 */
import {TestLab,DEFAULT_CHECKS} from './test_lab.js';
import {norm,tokenize,overlaps} from '/engine/semantic/text.js';
import {extractSlots} from '/engine/semantic/slots.js';
import {GRAMMAR_GLUE} from '/engine/semantic/validation.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const supportedMeasures={increase:['CHANGE','UP','RWA increase'],decrease:['CHANGE','DOWN','RWA decrease'],highest:['BALANCE','UP','Total RWA'],lowest:['BALANCE','DOWN','Total RWA'],percentage:['PERCENT','UP','Percentage increase'],question:[null,null,'As stated in the question']};
export const FIELD_ACTIONS={GROUP_ROOT_CAUSE:'Explain RWA movement',ENTITY_DRIVER:'Explain an entity’s RWA movement',MAIN_DRIVER:'Show main contributing drivers',DRIVER_CONTRIBUTION:'Show driver contribution',DRIVER_CHECK:'Check a driver',ENTITY_CONTRIBUTION:'Show entity contribution',TOP_CLIENTS:'Rank client groups',TOP_ENTITY:'Rank entities',COMPARE:'Compare',TREND:'Show history',PEAK_MONTH:'Find the largest month or balance',OFFSETS:'Show offsets',DATA_QUALITY:'Check driver totals',CONCENTRATION:'Check entity concentration',MOVEMENT_CHECK:'Check RWA direction'};

export function interpretationMessage(parsed){
 if(parsed.ok)return 'Check that this matches what you intended.';
 const code=parsed.code||'';
 if(code==='UNSUPPORTED_EXPRESSION')return 'Some wording is not recognised yet. Use Fix interpretation to connect it to a supported report.';
 if(code.startsWith('UNSUPPORTED'))return 'This type of request is not supported by the current engine. Recorded RWA reports are supported; forecasts and new calculations are not.';
 if(code.startsWith('AMBIGUOUS'))return 'More than one meaning or customer matches. Use a more specific expression or choose a client group.';
 if(code==='MISSING_REQUIRED_SLOT'||code==='INVALID_SCOPE')return 'Please name the client group and any reporting periods needed for this report.';
 if(code==='LOW_CONFIDENCE')return 'The meaning is not clear enough to run safely. Try a more specific question or use Fix interpretation.';
 return 'The engine could not safely interpret all of this question. Check names, dates and conditions, or use Fix interpretation.';
}

export function newLab(assets,text,hash){const lab=new TestLab();lab.setAssets(assets);lab.ensure(text,hash);return lab;}
export function defaultContext(lab){const gs=lab.groups(),id=gs.find(g=>/samsung/i.test(g.name))?.id||gs[0]?.id;const rows=lab.getData().rows.filter(r=>!id||r.client_group_id===id);return {selectedClientGroupId:id,selectedMonth:rows.map(r=>r.month).sort().at(-1)||'2026-07'};}
export function friendlyPeriod(p){if(!p)return 'Not specified';if(p.mode==='month')return new Date(p.month+'-01T12:00:00Z').toLocaleString('en',{month:'long',year:'numeric',timeZone:'UTC'});if(p.mode==='comparison')return p.months.map(m=>friendlyPeriod({mode:'month',month:m})).join(' versus ');if(p.mode==='window')return friendlyPeriod({mode:'month',month:p.start})+' to '+friendlyPeriod({mode:'month',month:p.end});return 'Available history through '+friendlyPeriod({mode:'month',month:p.end});}
export function humanPlan(parsed,query=''){
 if(!parsed?.ok)return [];
 const p=parsed.plan,ranking=['TOP_CLIENTS','TOP_ENTITY'].includes(p.action),out=[];
 out.push(['Report',FIELD_ACTIONS[p.action]||'Supported RWA report']);
 out.push(['Target',p.groups?.length?p.groups.join(' versus '):ranking&&p.action==='TOP_CLIENTS'?'Client groups':p.entities?.length?p.entities.join(' versus '):p.entity||p.group||'Available groups']);
 if(p.entity&&p.group)out.push(['Client group',p.group]);
 out.push(['Measure',p.metric==='BALANCE'?'Total RWA':p.metric==='PERCENT'?'Percentage change':p.direction==='UP'?'RWA increase':p.direction==='DOWN'?'RWA decrease':'RWA movement']);
 if(ranking){out.push(['Order',p.direction==='DOWN'?(p.metric==='BALANCE'?'Lowest first':'Largest decreases first'):p.direction==='ABSOLUTE'?'Largest absolute changes first':p.direction==='AUTO'?'Automatic direction (resolved from data)':'Highest first']);out.push(['Number',String(p.topN)]);}
 let label=friendlyPeriod(p.period);if(/\b(last|previous) month\b/i.test(query))label='Previous month · '+label;
 if(/\b(current|this) month\b/i.test(query))label='Current analysis month · '+label;
 out.push(['Period',label]);
 if(p.driver)out.push(['Driver',p.driver]);
 const excluded=[...(p.excludedDrivers||[]),...(p.excludedEntities||[]),...(p.excludedGroups||[])];if(excluded.length)out.push(['Excluding',excluded.join(', ')]);
 if(p.condition)out.push(['Filter',({GT:'Above',GTE:'At least',LT:'Below',LTE:'At most'}[p.condition.op]||p.condition.op)+' '+p.condition.value+(p.condition.metric==='PERCENT'?'%':' USD million')]);
 if(p.candidateGroups?.length||p.candidateEntities?.length)out.push(['Population','Previously displayed results only']);
 if(p.concise)out.push(['Answer length','Brief']);
 return out;
}
export function friendlyError(err){
 const code=err?.code||'';
 if(code==='EXPRESSION_CONFLICT'||code.startsWith('AMBIGUOUS'))return {title:'This expression could mean two different things.',body:err.message||'Use a more specific question, or name the group by its ID.',suggestions:['Use a more specific phrase','Keep the existing meaning']};
 if(code==='UNSAFE_EXPRESSION')return {title:'Some words must keep their existing meaning.',body:err.message,suggestions:['Keep names, dates, amounts and exclusions explicit','Try a simpler example']};
 if(code.startsWith('UNSUPPORTED')&&code!=='UNSUPPORTED_EXPRESSION')return {title:'This request is not supported yet.',body:'Choose a recorded RWA report. Forecasts, new calculations and unrelated questions cannot be added as synonyms.',suggestions:['Choose a supported report','Rewrite the question']};
 if(code==='REVISION_CONFLICT'||code==='SOURCE_CHANGED')return {title:'The project has changed.',body:'Reload the latest version before saving. Your last working rules have not been replaced.',suggestions:['Reload the home page']};
 if(code==='COMPILER_VALIDATION')return {title:'The change could not be saved safely.',body:'A rule conflicts with an existing definition, or a required setting is missing. The current working rules are unchanged. Technical details are available in Advanced.',suggestions:['Change the example','Cancel this change']};
 return {title:'Please review this change.',body:err?.message||'The operation did not complete. Your saved rules have not been changed.',suggestions:['Edit the example','Cancel']};
}
export function suggestion(recipe,d){
 const n=d.exampleNumber||10;let q;
 if(recipe.detail==='ranking'){
   const target=recipe.key==='rank_groups'?'groups':'entities';
   const metric={increase:'by RWA increase',decrease:'by RWA decrease',highest:'by higher RWA balance',lowest:'by lower RWA balance',percentage:'by percentage increase',question:'by RWA movement'}[d.measure]||'by RWA increase';
   q=d.numberMode==='default'?`Rank ${target} ${metric}`:`Show top ${n} ${target} ${metric}`;
 }else if(recipe.key==='movement')q=d.measure==='question'?'Explain Samsung RWA movement':'Why did Samsung RWA '+(d.measure==='decrease'?'decrease':'increase');
 else if(recipe.key==='direction_check')q='Did Samsung RWA '+(d.measure==='decrease'?'decrease':'increase');
 else if(recipe.key==='history')q='Show Samsung trend';
 else q=recipe.example.replace(/\?$/,'').replace(/ in July$/,'');
 if(recipe.detail==='ranking'||['movement','simple','history'].includes(recipe.detail)){
   const per={previous:' in last month',current:' in this month',last3:' over the last 3 months',context:'',question:' in July'}[d.periodMode]??'';
   q+=per;
 }
 return q;
}
function prepareState(lab,recipe,context){
 lab.engine.reset();
 if(!recipe.patch)return;
 const seed=recipe.patch==='ADD_FILTER'?'Top 10 groups in '+context.selectedMonth:'Explain '+context.selectedClientGroupId+' in '+context.selectedMonth;
 const result=lab.engine.answer(seed,context);
 if(!result.ok)throw {code:'CONTEXT_TEST',message:'The local sample cannot prepare the required preceding report. Select suitable local test data in Advanced.'};
}
function intendedAction(recipe,p){return p?.action===recipe.command||(recipe.command==='GROUP_ROOT_CAUSE'&&p?.action==='ENTITY_DRIVER');}
export function checkMeaning(parsed,recipe,d,query,context,defaultN){
 if(!parsed?.ok)return parsed?.message||'The engine did not understand this example.';
 const p=parsed.plan;
 if(recipe.patch){if(parsed.explain?.contextPatch?.type&&parsed.explain.contextPatch.type!==recipe.patch)return 'This follow-up updates a different part of the previous report.';return null;}
 if(!intendedAction(recipe,p))return 'The engine understands this as “'+(FIELD_ACTIONS[p.action]||'a different report')+'”, not “'+recipe.title+'”.';
 const [metric,direction]=supportedMeasures[d.measure]||[];
 if(['ranking','movement'].includes(recipe.detail)){
  if(metric&&p.metric!==metric)return 'The question asks for a different measure. Make “total RWA”, “increase” or “decrease” explicit.';
  if(direction&&(p.direction!==direction))return 'The direction does not match. Say increase or decrease explicitly.';
 }
 if(recipe.detail==='ranking'){
   if(d.numberMode==='default'&&p.topN!==defaultN)return 'This example supplies a number. Remove it to use the engine default ('+defaultN+').';
   if(d.numberMode==='question'&&!(parsed.explain?.numbers||[]).some(x=>x.role==='topN'||x.kind==='integer'||x.unit==='count')&&!/\b(?:top|first|largest|biggest|highest|lowest)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty)\b/i.test(query)){
     // The parser's typed top slot is checked below; ordinary numeric phrases are not guessed.
     const normalized=norm(query),lex=parsed.explain; // do not suppress a real parse success just for a debug shape variation
     if(!/\b\d+\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty)\b/i.test(normalized))return 'Include a number in this example, or choose the default number.';
   }
 }
 if(recipe.key==='compare_periods'&&p.period?.mode!=='comparison')return 'Name two periods to compare, for example June and July.';
 if(recipe.key==='compare_groups'&&p.groups?.length!==2)return 'Name two client groups to compare.';
 if(d.periodMode==='previous'){
  const date=new Date((context.selectedMonth||'2026-07')+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);
  if(p.period?.mode!=='month'||p.period.month!==date.toISOString().slice(0,7)||!/\b(last|previous) month\b/i.test(query))return 'Include “last month” or “previous month” in each example.';
 }
 if(d.periodMode==='current'&&!/\b(this|current) month\b/i.test(query))return 'Include “this month” or “current month” in each example.';
 if(d.periodMode==='last3'&&(p.period?.mode!=='window'||!/\b3\b|\bthree\b/i.test(query)))return 'Include “last 3 months” in each example.';
 return null;
}
export function proposeExamples(lab,recipe,d,questions,context,bindings=[]){
 const out=[];
 for(const question of questions){
  prepareState(lab,recipe,context);
  const parsed=lab.engine.parseQuestion(question,context),text=norm(question);
  if((parsed.code?.startsWith('UNSUPPORTED')&&parsed.code!=='UNSUPPORTED_EXPRESSION')||parsed.code?.startsWith('AMBIGUOUS')||parsed.code==='INVALID_INPUT')throw {code:parsed.code,message:parsed.message};
  const dictionary=lab.engine.parser.dictionary,lex=dictionary.resolve(text),slots=extractSlots(text,lex,context.selectedMonth||'2026-07',lab.engine.parser.registry.settings,lab.engine.parser.registry);
  if(slots.error)throw {code:slots.code,message:slots.error};
  if(recipe.patch){
   let captures=[];
   if(recipe.slot==='scope')captures=lex.names;
   if(recipe.slot==='period')captures=slots.periodSpans;
   if(recipe.slot==='driver')captures=slots.drivers;
   if(recipe.slot==='threshold')captures=slots.threshold?[slots.threshold]:[];
   if(recipe.slot&&captures.length!==1)throw {code:'UNRESOLVED_EXAMPLE',message:'Use one clearly named '+(recipe.slot==='scope'?'group or entity':recipe.slot)+' in this follow-up example.'};
   const cap=captures[0];let pattern=text.replace(/[?.!]+$/,'');if(cap)pattern=pattern.slice(0,cap.start)+'{'+recipe.slot+'}'+pattern.slice(cap.end);
   out.push({question,pattern});continue;
  }
  const existing=bindings.find(b=>b.question===question);
  // Retain owned dependency references even after the expression is understood.
  if(existing?.source_file==='synonyms.csv'){out.push({question,phrase:existing.source_key});continue;}
  if(parsed.ok){const err=checkMeaning(parsed,recipe,d,question,context,lab.engine.parser.registry.settings.default_top_n);if(err)throw {code:'MEANING_MISMATCH',message:err};out.push({question});continue;}
  const unknown=new Set(parsed.explain?.unknownTokens||[]);
  if(!unknown.size)throw {code:parsed.code,message:parsed.message||'This example needs more information. Use the suggested example.'};
  const protectedSpans=[...lex.names,...lex.matches,...slots.spans];
  const tokens=tokenize(text).filter(t=>/[\p{L}\p{N}]/u.test(t.text));
  const indexes=tokens.map((t,i)=>unknown.has(t.text)?i:-1).filter(i=>i>=0);
  if(!indexes.length)throw {code:'UNRESOLVED_EXAMPLE',message:'Use a simpler example. No safe new phrase could be isolated.'};
  let lo=indexes[0],hi=indexes.at(-1);
  const blocked=t=>protectedSpans.some(s=>overlaps(t,s));
  if(tokens.slice(lo,hi+1).some(blocked))throw {code:'UNRESOLVED_EXAMPLE',message:'There are several separate unfamiliar phrases. Add a simpler example with just one new expression first.'};
  while(lo>0&&!blocked(tokens[lo-1])&&GRAMMAR_GLUE.has(tokens[lo-1].text))lo--;
  while(hi<tokens.length-1&&!blocked(tokens[hi+1])&&GRAMMAR_GLUE.has(tokens[hi+1].text))hi++;
  // Only a new request prefix may become an action synonym. An unknown word
  // after an existing action/name may be an unlisted customer, driver or
  // qualifier; mapping it to ROOT would silently replace its meaning.
  const before=tokens.slice(0,lo).filter(t=>!GRAMMAR_GLUE.has(t.text));
  const courtesy=lex.matches.filter(m=>m.concept==='COURTESY');
  const hasEarlierMeaning=[...lex.names,...lex.matches.filter(m=>m.concept!=='COURTESY'),...slots.spans].some(span=>span.end<=tokens[lo].start);
  if(hasEarlierMeaning||before.some(t=>!courtesy.some(m=>overlaps(t,m))))throw {code:'UNRESOLVED_EXAMPLE',message:'The unfamiliar word may be a customer, driver or extra condition. Use a recognised client name and put the new request wording at the start of a simpler example. Names and data are not registered as report expressions.'};
  let phrase=text.slice(tokens[lo].start,tokens[hi].end).trim();
  // Trim grammar connectors directly adjoining a protected name/value.
  phrase=phrase.replace(/\s+(?:for|in|with|of|by)$/,'').replace(/^(?:show|please|could you|can you)\s+/,'').trim();
  if(!phrase||!/^[a-z][a-z '-]{1,159}$/.test(phrase))throw {code:'UNRESOLVED_EXAMPLE',message:'The unfamiliar part includes a name, number or punctuation. Keep those separate and simplify the new phrase.'};
  out.push({question,phrase});
 }
 return out;
}
function outcome(parsed){
 if(!parsed.ok)return {ok:false,code:parsed.code};
 const p=copy(parsed.plan);
 for(const k of ['ruleConfidence','candidateScores','scoreMeaning','trace','semanticFeatures','ruleVersion','source','contextNotes'])delete p[k];
 return {ok:true,plan:p};
}
const CONTROL_QUESTIONS=[...DEFAULT_CHECKS.filter(x=>!x.sequence).map(x=>x.query),'Why did Samsung RWA increase in July?','Did Samsung RWA increase in July?','How much did Samsung RWA increase in July?','Top 10 groups by RWA increase in July','Top 10 groups by total RWA in July','Top 10 groups excluding Samsung in July','Compare Samsung and Toyota in July','Compare Samsung in June and July','Show Samsung trend over the last 3 months','Why did Samsung RWA not increase?','Show top 10 groups above 25m excluding Toyota in July','Explain Samsung in July excluding FX','Explain Samsung in Jully','Show groups above 25 miloin','Predict RWA next year','Sell Samsung stock','What is Samsung share price?'];
export async function verifyDraft(assets,base,draft,recipe,details,questions,context,onProgress=()=>{}){
 const old=newLab(assets,base.generatedText,base.artifactHash),next=newLab(assets,draft.generatedText,draft.artifactHash),checks=[];
 if(draft.operation!=='delete')for(const q of questions){
  prepareState(next,recipe,context);const result=next.engine.parseQuestion(q,context),error=checkMeaning(result,recipe,details,q,context,next.engine.parser.registry.settings.default_top_n);
  checks.push({name:'Example',query:q,pass:!error,message:error,meaning:humanPlan(result,q)});
 }
 if(draft.deletedAction)for(const q of draft.deletedExamples||[]){
  old.engine.reset();next.engine.reset();const a=old.engine.parseQuestion(q,context),b=next.engine.parseQuestion(q,context);
  if(a.plan?.action===draft.deletedAction)checks.push({name:'Deleted report example',query:q,pass:!b.ok,message:b.ok?'Removing this report would route its example to another report. Keep it and review shared wording in Advanced.':null});
 }
 // Other saved capabilities are re-tested, including shared dependencies.
 for(const card of draft.remainingCards||[]){
  const rr=(draft.recipes||[]).find(r=>r.key===card.kind);if(!rr)continue;
  for(const q of card.examples){prepareState(next,rr,context);const r=next.engine.parseQuestion(q,context);const err=checkMeaning(r,rr,card,q,context,next.engine.parser.registry.settings.default_top_n);checks.push({name:'Other saved capability',query:q,pass:!err,message:err});}
 }
 // Baseline-vs-draft full execution parameters; exclude only a deliberately
 // disabled report's positive requests. Unsupported controls must remain rejected.
 let n=0;
 for(const q of [...new Set(CONTROL_QUESTIONS)]){
  old.engine.reset();next.engine.reset();const a=old.engine.parseQuestion(q,context),b=next.engine.parseQuestion(q,context);
  if(draft.deletedAction&&a.plan?.action===draft.deletedAction){checks.push({name:'Deleted report',query:q,pass:!b.ok,message:b.ok?'Deleting this report would reroute its questions to another report. Keep it and review the shared wording in Advanced.':null});continue;}
  const pass=JSON.stringify(outcome(a))===JSON.stringify(outcome(b));checks.push({name:'Existing behavior',query:q,pass,message:pass?null:'This change also affects an existing question. Use narrower wording.'});
  if(++n%5===0){onProgress(n);await new Promise(r=>setTimeout(r,0));}
 }
 return {passed:checks.filter(c=>c.pass).length,total:checks.length,failed:checks.filter(c=>!c.pass),checks,kind:'Real parser in this browser; known local examples, not a blind accuracy measurement'};
}
