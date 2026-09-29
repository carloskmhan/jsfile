import {removeSpans,tokenize,uniq} from './text.js';
import {monthRange} from './periods.js';
// Grammar glue only. Financial qualifiers must be dictionary concepts or parsed relations.
export const GRAMMAR_GLUE=new Set('a an the this these those it its s of for in on at to from with and as than then now how what who show tell give get me us you we i our your their can could would should please did does do is are was were has have had be been being most more much less least each both all any some into within across by about over between since through until during per same basis conditions respectively happened happen doing why so numbers number after before'.split(' '));
export function unknownContent(text,lex,slots,patch){
  if(patch&&!patch.error)return []; // Entire registered patch plus fully parsed finite suffix clauses matched.
  const spans=[...lex.names,...lex.matches,...slots.spans];
  const rest=removeSpans(text,spans);
  return uniq(tokenize(rest).map(t=>t.text).filter(t=>/[\p{L}\p{N}]/u.test(t)&&!GRAMMAR_GLUE.has(t)));
}
export function detectUnsupported(lex,text){
  text=removeSpans(text,lex.matches.filter(m=>m.driver));
  if(/\bwhy\b.*\bnot\b/.test(text))return {code:'UNSUPPORTED_NEGATIVE_PREMISE',message:'A causal explanation of a negative premise is not implemented. Ask whether RWA increased, or request the recorded movement.'};
  const hits=lex.matches.filter(m=>m.concept.startsWith('UNSUPPORTED_'));
  if(hits.length)return {code:hits.some(h=>h.concept==='UNSUPPORTED_FORECAST')?'UNSUPPORTED_INTENT':'UNSUPPORTED_QUERY',message:'Unsupported request: '+uniq(hits.map(h=>h.text)).join(', ')+'. Only recorded RWA reporting is available.',hits};
  if(/\bwhy\b.*\b(rating|credit grade|credit quality)\b.*\b(deteriorat\w*|downgrad\w*|worsen\w*)\b/.test(text)&&!lex.concepts.RWA)return{code:'UNSUPPORTED_INTENT',message:'The attribution data do not explain why a rating changed. Approved rating-event evidence is required.',hits:[]};
  return null;
}
const exists={
  metric:()=>true,intent:p=>!!p.action,subject:p=>!!(p.group||p.entity),entity:p=>!!p.entity,
  entities:p=>p.entities.length===2||p.groups.length===2,period:p=>!!p.period,
  comparison:p=>p.entities.length===2||p.groups.length===2||p.period.mode==='comparison'||p.peer,
  topN:p=>Number.isInteger(p.topN)&&p.topN>0,driver:p=>!!p.driver,
  scope:p=>!!(p.group||p.dimension==='GROUP'),forecast:()=>false,
  filter:p=>!!p.condition,threshold:p=>!!p.condition,exclusions:p=>p.excludedDrivers.length+p.excludedEntities.length+p.excludedGroups.length>0,
  candidateSet:p=>p.candidateEntities.length+p.candidateGroups.length>0,modifier:()=>true,aggregation:p=>!!p.dimension,concise:()=>true,
  unit:p=>!!p.condition?.unit,direction:p=>!!p.direction,ranking:p=>['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK'].includes(p.action),periodComparison:p=>p.period.mode==='comparison',rankReference:()=>true,query:()=>true
};
export function validateConstraints(p,command,slots,relations,settings){
  const missing=command.required_slots.filter(k=>!exists[k]?.(p));
  const forbidden=command.forbidden_slots.filter(k=>exists[k]?.(p));
  const errors=[];
  const allowed=new Set([...command.required_slots,...command.optional_slots]);
  const extras=[];
  if(p.driver&&!allowed.has('driver'))extras.push('driver');
  if(p.condition&&!allowed.has('filter')&&!allowed.has('threshold'))extras.push('filter');
  if(exists.exclusions(p)&&!allowed.has('exclusions'))extras.push('exclusions');
  if(exists.candidateSet(p)&&!allowed.has('candidateSet'))extras.push('candidateSet');
  if(p.concise&&!allowed.has('concise')&&!allowed.has('modifier'))extras.push('concise');
  if(extras.length)errors.push({code:'UNSUPPORTED_MODIFIER',message:'The CSV command definition does not allow: '+extras.join(', ')+'.'});
  const scopeValid=command.scope==='ANY'||command.scope==='ENTITY'&&!!p.entity||command.scope==='GROUP'&&!!p.group&&!p.entity||command.scope==='PORTFOLIO'&&!p.group&&p.dimension==='GROUP';
  if(!scopeValid)errors.push({code:'INVALID_SCOPE',message:'This command requires '+command.scope.toLowerCase()+' scope.'});
  if(missing.length)errors.push({code:'MISSING_REQUIRED_SLOT',message:'Missing required parameter(s): '+missing.join(', ')+'.'});
  if(forbidden.length)errors.push({code:'FORBIDDEN_SLOT',message:'This command forbids: '+forbidden.join(', ')+'.'});
  if(p.topN<1||p.topN>settings.max_top_n)errors.push({code:'INVALID_SLOT',message:'Top N is outside the configured range.'});
  if(relations.subjects.length>2&&!relations.subjects.every(x=>x.kind==='ENTITY'&&x.parentId===p.groupId))errors.push({code:'UNSUPPORTED_COMPARISON',message:'At most two comparison subjects are supported.'});
  if(p.groups.length>1||p.entities.length>1){
    if(p.action!=='COMPARE')errors.push({code:'AMBIGUOUS_COMMAND',message:'Multiple named subjects require an explicit comparison, not a single-subject report.'});
    if(p.period.mode==='comparison')errors.push({code:'UNSUPPORTED_COMPARISON',message:'Compare two subjects or two periods, not both at once.'});
  }
  if(p.period.mode==='comparison'&&p.action!=='COMPARE')errors.push({code:'UNSUPPORTED_COMPARISON',message:'Two separate periods require a comparison report.'});
  if(slots.dimension&&['PRODUCT','LOCATION'].includes(slots.dimension)&&p.action!=='TOP_ENTITY')errors.push({code:'UNSUPPORTED_MODIFIER',message:'A product/location breakdown requires a contributor ranking; this modifier cannot be discarded.'});
  if(p.driver&&!['DRIVER_CHECK','DRIVER_CONTRIBUTION','TOP_ENTITY','TOP_CLIENTS','COMPARE'].includes(p.action))errors.push({code:'UNSUPPORTED_MODIFIER',message:'This report would not apply the named driver. Ask for its contribution, check it, or rank contributors by that driver.'});
  if(p.driver&&p.metric==='PERCENT')errors.push({code:'UNSUPPORTED_MODIFIER',message:'A monetary driver contribution cannot be ranked as a percentage-change value. Use one explicit metric.'});
  if(p.driver&&p.action==='COMPARE')errors.push({code:'UNSUPPORTED_MODIFIER',message:'Driver-specific comparison is not implemented by the existing executor.'});
  if(p.excludedDrivers.includes(p.driver)&&['DRIVER_CHECK','DRIVER_CONTRIBUTION'].includes(p.action))errors.push({code:'CONTRADICTORY_MODIFIER',message:p.driver+' is excluded. Include it before asking for its contribution.'});
  if(p.metric==='BALANCE'&&p.excludedDrivers.length)errors.push({code:'UNSUPPORTED_MODIFIER',message:'Driver attribution cannot be subtracted from a balance. Ask for the movement excluding that driver.'});
  if(p.condition&&p.condition.metric!=='BALANCE'&&['DOWN','ABSOLUTE'].includes(p.direction))errors.push({code:'UNSUPPORTED_MODIFIER',message:'Decline/absolute-magnitude threshold semantics are not implemented. Request that ranking without a threshold.'});
  if(p.condition&&!['TOP_CLIENTS','TOP_ENTITY'].includes(p.action))errors.push({code:'UNSUPPORTED_MODIFIER',message:'Threshold filters apply to rankings only.'});
  if(['PRODUCT','LOCATION'].includes(p.dimension)&&p.action!=='TOP_ENTITY')errors.push({code:'UNSUPPORTED_MODIFIER',message:'Product/location detail is available as a contributor ranking, not an implicit filter.'});
  if(p.excludedGroups.length&&!['TOP_CLIENTS','HISTORICAL_GROUP_PEAK'].includes(p.action))errors.push({code:'UNSUPPORTED_MODIFIER',message:'Group exclusions apply only to portfolio group rankings; they cannot silently filter an unrelated group from a single-group report.'});
  if(relations.excluded.some(x=>x.kind==='ENTITY'&&p.groupId&&x.parentId!==p.groupId)&&p.action!=='TOP_CLIENTS'&&!p.groups.length)errors.push({code:'AMBIGUOUS_ENTITY',message:'An excluded entity belongs to a different group from the report scope.'});
  if((p.excludedGroupIds?.length?p.excludedGroupIds.includes(p.groupId):p.excludedGroups.includes(p.group))&&p.action!=='TOP_CLIENTS')errors.push({code:'CONTRADICTORY_MODIFIER',message:'The requested group is also excluded.'});
  if(slots.metricExplicit&&p.metric==='PERCENT'&&!['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK','PEAK_MONTH','COMPARE','GROUP_ROOT_CAUSE','ENTITY_DRIVER'].includes(p.action))errors.push({code:'UNSUPPORTED_MODIFIER',message:'This report does not support that explicit metric.'});
  if(p.period.mode==='window'){try{monthRange(p.period.start,p.period.end,settings.max_window_months);}catch(e){errors.push({code:'INVALID_PERIOD',message:e.message});}}
  return {valid:errors.length===0,missing,forbidden,errors};
}
/** No fallback to a weaker candidate after the winning command fails its constraints. */
export function decide(candidates,unknown,relations){
  if(unknown.length)return{code:'UNSUPPORTED_EXPRESSION',message:'Uninterpreted words: '+unknown.slice(0,8).join(', ')+'. No calculation ran. Add a reviewed synonym/pattern or rephrase.'};
  if(relations.errors.length)return relations.errors[0];
  const top=candidates[0],second=candidates[1];if(!top||!top.primary)return{code:'UNSUPPORTED_INTENT',message:'No supported report intent was identified. Try explaining a movement, ranking contributors, or comparing two subjects.'};
  if(top.penalty<0)return{code:'AMBIGUOUS_COMMAND',message:'Conflicting report intents or conditions were found. Submit one report at a time.'};
  if(top.score<top.definition.min_confidence)return{code:'LOW_CONFIDENCE',message:'The manual rule-fit score is below the execution threshold. Rephrase or add a reviewed rule.'};
  if(second&&top.score-second.score<Math.max(top.effectiveMinMargin??top.definition.min_margin,0))return{code:'AMBIGUOUS_COMMAND',message:'Two report commands have similar rule-fit scores. Specify the intended analysis.'};
  if(!top.validation?.valid)return top.validation?.errors[0]||{code:'INVALID_COMMAND',message:'Command constraints did not validate.'};
  return null;
}
