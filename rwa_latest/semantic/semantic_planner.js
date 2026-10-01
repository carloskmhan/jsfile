/** Frame-first interpretation for bounded, CSV-enabled structures. No executor or authorisation bypass. */
import {normalizedInput,clone,removeSpans,overlaps} from './text.js';
import {parseRelations} from './relations.js';
import {composeLexical} from './composition_lexicon.js';
import {parseRoleRanking,parseCompoundContext,MeaningError} from './planning_syntax.js';
import {COMPOSITION_VERSION} from './composition_schema.js';

export const planningRule=(registry,shape)=>registry.composition?.rules.find(r=>r.enabled&&r.shape===shape)||null;
export function compoundPrefix(text){return /^(?:please )?(?:do the )?same (?:analysis|report)\b/.test(text);}
function rolePrefix(text){return /^(?:please )?(?:(?:show|rank|list) )?(?:the )?(?:top|bottom)\b/.test(text)&&/\bby\b/.test(text)&&/\b(?:with rwa|contribution to|attribution to|after excluding)\b/.test(text);}
export function prepareSemanticPlanning(question,dictionary,registry){
  const input=normalizedInput(question,registry.settings.max_query_chars);if(input.error)return null;
  const exact=dictionary.resolve(input.text);if(exact.collisions.length)return null;
  const structural=removeSpans(input.text,[...exact.names,...exact.matches.filter(m=>m.driver)]);
  const shape=compoundPrefix(structural)?'COMPOUND_CONTEXT':rolePrefix(structural)?'RANKING_ROLES':null;
  const rule=shape&&planningRule(registry,shape);if(!rule)return null;
  const expanded=composeLexical(question,dictionary,registry);if(expanded?.error)return null;
  return {text:input.text,lex:expanded?.lex||exact,fuzzy:{attempts:[],corrections:[]},
    phraseResolution:{policy:'Protected original spans; complete typed grammar before command selection.',matches:exact.matches.map(m=>({phrase:m.text,concept:m.concept,start:m.start,end:m.end}))},
    planning:{shape,rule,additions:clone(expanded?.composition?.additions||[])}};
}
export function interpretMeaning(text,lex,original,registry,state,request){
  const shape=request.shape,rule=planningRule(registry,shape);
  if(!rule)throw new MeaningError('UNSUPPORTED_SEMANTIC_STRUCTURE','This semantic structure is disabled.');
  const syntax=shape==='RANKING_ROLES'?parseRoleRanking(text,lex,original,4):parseCompoundContext(text,lex,original,4);
  if(!syntax)throw new MeaningError('UNSUPPORTED_SEMANTIC_STRUCTURE','No complete reviewed semantic structure was found.');
  if(shape==='COMPOUND_CONTEXT'&&!state.action)throw new MeaningError('MISSING_CONTEXT','Run a compatible report first; a preview or failed request is not conversation context.','context');
  if(shape==='COMPOUND_CONTEXT'&&!rule.actions.includes(state.action))throw new MeaningError('UNSUPPORTED_CONTEXT','This compound request supports a recorded group/entity movement report or entity ranking, not historical peaks or comparisons.','context');
  const slots={...clone(original),period:syntax.period,metric:syntax.metric||original.metric,
    direction:syntax.direction||original.direction,dimension:syntax.dimension||null,
    topN:syntax.topN||null,threshold:syntax.condition||null,
    metricExplicit:shape==='RANKING_ROLES',concise:false};
  const relations=parseRelations('',{matches:[],concepts:{}},{...slots,names:[],drivers:[]});
  const subject=syntax.subject;
  Object.assign(relations,{subjects:subject?[subject]:[],groups:subject?[subject.id]:[],entities:[],
    driver:syntax.driver||null,excludedDrivers:syntax.excludedDrivers,includedDrivers:syntax.includedDrivers,
    sameBasis:shape==='COMPOUND_CONTEXT',hasThreshold:!!syntax.condition});
  let patch=null;
  if(shape==='COMPOUND_CONTEXT'){
    const captures={};if(subject)captures.scope={value:subject};if(syntax.period)captures.period={value:syntax.period};
    const type=subject?'REPLACE_SCOPE':syntax.period?'REPLACE_PERIOD':syntax.includedDrivers.length?'INCLUDE':'EXCLUDE';
    patch={rule:{rule_id:rule.rule_id,patch_type:type,target_slot:'scope',command_id:'',pattern:'<typed-compound>'},captures,matchedText:text,compositionRule:rule.rule_id};
  }
  const concepts=shape==='RANKING_ROLES'?{RWA:1,RANK:1,[syntax.dimension]:1,
    ...(syntax.metric==='PERCENT'?{PERCENT:1}:syntax.metric==='BALANCE'?{BALANCE:1}:{}),
    ...(syntax.direction==='UP'?{INCREASE:1}:syntax.direction==='DOWN'?{DECREASE:1}:{})}:{RWA:1,SAME:1};
  // Every additional grammar token has actually been consumed. Never blanket-cover an unknown suffix.
  const known=[...lex.names,...lex.matches];
  const grammarWords=syntax.tokens.filter(t=>t.type==='WORD'&&!known.some(s=>overlaps(s,t))).map(t=>({...t,concept:'TECHNICAL',weight:1,source:rule.source}));
  const scopedLex={...lex,concepts,matches:[...lex.matches,...grammarWords].sort((a,b)=>a.start-b.start)};
  return {syntax,slots,relations,patch,lex:scopedLex,rule,request};
}
const boundFields=['groupId','entityId','groups','entities','comparisonIds','dimension','metric','direction','topN','driver','period',
  'excludedDrivers','excludedEntities','excludedEntityIds','excludedGroups','excludedGroupIds','condition','checkMode','concise',
  'candidateEntities','candidateEntityIds','candidateGroups','candidateGroupIds'];
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function bindMeaningContract(meaning,projection,anchor){
  const p=clone(projection.plan),s=meaning.syntax;
  const action=s.action||p.action;
  if(action==='TOP_CLIENTS'){p.group=null;p.groupId=null;p.entity=null;p.entityId=null;p.dimension='GROUP';}
  else if(action==='TOP_ENTITY'){p.entity=null;p.entityId=null;}
  const bound=Object.fromEntries(boundFields.filter(k=>p[k]!==undefined).map(k=>[k,clone(p[k])]));
  const provenance={};
  for(const role of ['TARGET','MEASURE','DIRECTION','PERIOD','RANK','FILTER','EXCLUSION'])provenance[role]={origin:s.shape==='COMPOUND_CONTEXT'?'INHERITED_UNLESS_EXPLICIT':'EXPLICIT_OR_EXISTING_DEFAULT'};
  return {version:COMPOSITION_VERSION,stage:'BEFORE_COMMAND_SELECTION',shape:s.shape,ruleId:meaning.rule.rule_id,source:clone(meaning.rule.source),
    ACTION:action,TARGET:{level:p.dimension||(p.entityId?'ENTITY':p.groupId?'GROUP':null),groupId:p.groupId,entityId:p.entityId},
    MEASURE:{metric:p.metric,driver:p.driver,basis:p.metric==='BALANCE'?'CLOSING_BALANCE':p.metric==='PERCENT'?'EXISTING_PERCENT_CHANGE_POLICY':'EXISTING_MOVEMENT_POLICY'},
    DIRECTION:p.direction,PERIOD:clone(p.period),RANK:['TOP_CLIENTS','TOP_ENTITY'].includes(action)?{limit:p.topN,order:p.direction}:null,
    FILTER:p.condition?{...clone(p.condition),targetLevel:p.dimension,application:'BEFORE_TOP_N',period:clone(p.period)}:null,
    EXCLUSION:{drivers:clone(p.excludedDrivers),groupIds:clone(p.excludedGroupIds),entityIds:clone(p.excludedEntityIds)},
    RELATION:{driverRole:p.driver?'RANK_MEASURE':p.excludedDrivers.length?'ATTRIBUTION_EXCLUSION':null,operations:clone(s.operations),contextChangesAtomic:s.shape==='COMPOUND_CONTEXT'},
    provenance,evidence:clone(s.ledger),unresolved:[],contradictions:[],candidates:[{action,bound}],temporalAnchor:anchor};
}
export function validateMeaningContract(frame,plan){
  const mismatches=[];
  if(frame.candidates.length!==1||frame.candidates.length>4)mismatches.push('candidateCount');
  const expected=frame.candidates[0];
  if(plan.action!==expected.action)mismatches.push('action');
  for(const [key,value]of Object.entries(expected.bound))if(!equal(value,plan[key]))mismatches.push(key);
  return {valid:!mismatches.length,mismatches,errors:mismatches.length?[{code:'SEMANTIC_PLAN_MISMATCH',message:'The selected command would change these interpreted conditions: '+mismatches.join(', ')+'. No weaker command was substituted.'}]:[]};
}

/** Audit is read-only and in-memory. Existing accepted output is not retroactively relabelled. */
export function auditAcceptedMeaning(text,lex,accepted,planned,registry){
  if(!planningRule(registry,'ACCEPTED_AUDIT'))return null;
  const structural=removeSpans(text,[...lex.names,...lex.matches.filter(m=>m.driver)]),findings=[];
  for(const m of structural.matchAll(/\b(net|gross)\b/g))findings.push({code:'UNDEFINED_AGGREGATION_BASIS',field:'measureBasis',word:m[0],start:m.index,end:m.index+m[0].length,
    message:'Legacy TOTAL recognition does not define '+m[0]+'. Specify the subtraction/aggregation basis before changing this meaning.'});
  if(planned?.ok){
    for(const field of ['metric','driver','condition','excludedDrivers','groupId','entityId','period','dimension'])if(!equal(accepted.plan[field],planned.plan[field]))findings.push({code:'ROLE_BINDING_DISAGREEMENT',field,legacy:clone(accepted.plan[field]??null),structured:clone(planned.plan[field]??null)});
  }else if(planned?.explain?.clarification)findings.push({code:'STRUCTURE_REQUIRES_REVIEW',...clone(planned.explain.clarification)});
  return {version:COMPOSITION_VERSION,policy:'OBSERVE_ONLY',action:accepted.plan.action,findings,changesExecution:false};
}

/** Scope-only half of the compound grammar. It never authorises a report or widens to portfolio. */
export function routeMeaningScope(text,lex,registry,state,context){
  if(context.compositionMode!=='guarded')return null;
  const rule=planningRule(registry,'COMPOUND_CONTEXT');if(!rule)return null;
  const structural=removeSpans(text,[...lex.names,...lex.matches.filter(m=>m.driver)]);
  if(!compoundPrefix(structural))return null;
  if(lex.collisions.length)return {ok:false,code:'AMBIGUOUS_ENTITY',message:'Specify a unique group ID for the compound request.'};
  if(!state.action)return {ok:false,code:'MISSING_CONTEXT',message:'Run a compatible report before changing its group, month or driver conditions.'};
  if(!rule.actions.includes(state.action))return {ok:false,code:'UNSUPPORTED_CONTEXT',message:'Compound replacements require a group/entity movement report or entity ranking.'};
  const names=lex.names.filter(n=>/\bfor\s*$/.test(text.slice(0,n.start)));
  if(names.length>1||names.some(n=>n.item.kind!=='GROUP'))return {ok:false,code:'AMBIGUOUS_SCOPE',message:'Use one authorised group ID after “for”.'};
  if(/\bfor\b/.test(structural)&&names.length!==1)return {ok:false,code:'UNKNOWN_ENTITY',message:'The replacement group after “for” is not resolved in the authorised index. Use its group ID.'};
  const id=names[0]?.item.id||state.groupId;
  if(!id)return {ok:false,code:'MISSING_REQUIRED_SLOT',message:'The prior successful report has no unambiguous group scope.'};
  return {ok:true,portfolio:false,groupIds:[id]};
}
