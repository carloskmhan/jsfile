import {asNumber,overlaps,uniq} from './text.js';
import {parsePeriods} from './periods.js';
import {parseNumbers} from './numbers.js';
const DRIVER_MAP=Object.freeze({DRIVER_CG:'CG',DRIVER_EAD:'EAD',DRIVER_PD:'PD',DRIVER_LGD:'LGD',DRIVER_FX:'FX',DRIVER_MATURITY:'Maturity',DRIVER_CRM:'CRM',DRIVER_BASEL:'Basel Method',DRIVER_NEW_BUSINESS:'New Business',DRIVER_NOVATION:'Novation',DRIVER_AMENDMENT:'Amendment',DRIVER_TRANSFER:'Booking Transfer',DRIVER_OTHER:'Other'});
export function extractSlots(text,lex,anchor,settings,registry){
  const protectedSpans=[...lex.names,...lex.matches.filter(m=>m.driver||m.concept==='HISTORY_SCOPE')];
  const numeric=parseNumbers(text,protectedSpans,registry);
  if(numeric.error)return {...numeric,layer:'NUMBER_UNIT'};
  const dates=parsePeriods(text,anchor,[...protectedSpans,...numeric.spans],settings.max_window_months,registry.temporal);
  if(dates.error)return {...dates,numbers:numeric.numbers,layer:'TEMPORAL'};
  if(lex.concepts.HISTORY_SCOPE){
    if(dates.period)return {code:'AMBIGUOUS_PERIOD',error:'Choose all available history OR an explicit reporting window, not both.',numbers:numeric.numbers};
    dates.period={mode:'history',end:anchor};
  }
  const drivers=lex.matches.filter(m=>m.driver||DRIVER_MAP[m.concept]).map(m=>({...m,driver:m.driver||DRIVER_MAP[m.concept],kind:'driver'}));
  const {topN,topSpan}=numeric,thresholds=numeric.threshold?[numeric.threshold]:[];
  const refs=[];
  const referenceRe=/\b(the first one|first one|the second one|second one|the third one|third one|the largest one|largest one|the next one|next one|that entity|that subsidiary|that group|that one|the first|the second|the third)\b/g;
  for(const r of text.matchAll(referenceRe)){
    const span={start:r.index,end:r.index+r[0].length,text:r[0],kind:'rankref'};
    if(lex.names.some(n=>overlaps(n,span)))continue;
    const index=/second/.test(r[0])?1:/third/.test(r[0])?2:/next/.test(r[0])?'next':/that/.test(r[0])?'focus':0;
    refs.push({...span,index});
  }
  const percentage=!!(lex.concepts.PERCENT||lex.concepts.HISTORICAL_HIGH||lex.concepts.HISTORICAL_LOW)||thresholds.some(t=>t.metric==='PERCENT')&&/\bby\b/.test(text);
  const balanceCondition=!!numeric.threshold&&/\b(?:with\s+)?rwa\s*$/.test(text.slice(0,numeric.threshold.start));
  const metric=(lex.concepts.BALANCE||balanceCondition)?'BALANCE':percentage?'PERCENT':'CHANGE';
  if(numeric.threshold?.unit==='ratio'&&metric==='BALANCE')return {code:'INVALID_UNIT',error:'A percentage/basis-point threshold cannot filter an RWA money balance.',numbers:numeric.numbers};
  if(numeric.threshold?.isBps&&!percentage)return {code:'UNSUPPORTED_UNIT',error:'Basis points require an explicit percentage-change metric; they are not a money amount.',numbers:numeric.numbers};
  let direction=lex.concepts.ABSOLUTE?'ABSOLUTE':lex.concepts.DECREASE?'DOWN':lex.concepts.INCREASE?'UP':'AUTO';
  if(/\b(bottom|lowest|smallest|minimum|trough)\b/.test(text))direction='DOWN';
  if(percentage&&/\bpercentage (increase|growth)\b/.test(text))direction='UP';
  if(percentage&&/\bpercentage decrease\b/.test(text))direction='DOWN';
  if(lex.concepts.HISTORICAL_HIGH)direction='UP';
  if(lex.concepts.HISTORICAL_LOW)direction='DOWN';
  const dimension=lex.concepts.PRODUCT?'PRODUCT':lex.concepts.LOCATION?'LOCATION':(lex.concepts.ENTITY||lex.concepts.RANK_ENTITY)?'ENTITY':(lex.concepts.GROUP||lex.concepts.RANK_GROUP)?'GROUP':null;
  return {names:lex.names,drivers,period:dates.period,periodSpans:dates.spans,topN,topSpan,threshold:thresholds[0]||null,
    references:refs,numbers:numeric.numbers,temporalDebug:{anchor,spans:dates.spans,period:dates.period},metric,direction,dimension,concise:!!lex.concepts.BRIEF,
    aggregation:dimension,forecast:!!lex.concepts.UNSUPPORTED_FORECAST,metricExplicit:!!(lex.concepts.BALANCE||lex.concepts.PERCENT||balanceCondition),
    spans:[...dates.spans,...drivers,...refs,...thresholds,...(topSpan?[topSpan]:[])]};
}
export function publicSlots(plan){
  return {intent:plan.semanticIntent,metric:'RWA',entity:plan.entityId||plan.groupId||null,
    entities:plan.comparisonIds||[],period:plan.period,direction:plan.direction,scope:plan.entity?'ENTITY':plan.group?'GROUP':'PORTFOLIO',
    ranking:['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK'].includes(plan.action),topN:plan.topN,comparison:plan.comparison||null,
    driver:plan.driver,filter:plan.condition,modifier:{excludedDrivers:plan.excludedDrivers,excludedEntities:plan.excludedEntityIds||[],excludedGroups:plan.excludedGroupIds||[]},
    aggregation:plan.dimension,rankingMetric:plan.metric,threshold:plan.condition?{value:plan.condition.canonicalValue,unit:plan.condition.unit,operator:plan.condition.op,raw:plan.condition.raw,executorValue:plan.condition.value,executorUnit:plan.condition.executorUnit}:null,unit:plan.condition?.unit||null};
}
