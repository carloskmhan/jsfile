/** Serializable semantic contract. This is interpretation evidence, never a financial calculator. */
import {clone} from './text.js';
import {COMPOSITION_VERSION} from './composition_schema.js';
export function semanticFrame(plan,explain={},meta={}){
  const p=plan||{},matches=explain.matches||[],patch=explain.contextPatch;
  const evidence=concepts=>matches.filter(m=>concepts.includes(m.concept)).map(m=>({
    text:m.phrase,concept:m.concept,start:m.start,end:m.end,...(m.id?{id:m.id}:{})}));
  const groups={ACTION:['ROOT','MAIN','AMOUNT','CHECK','RANK','RANK_GROUP','RANK_ENTITY','COMPARE','TREND','PEAK'],
    TARGET:['GROUP','ENTITY'],MEASURE:['RWA','BALANCE','PERCENT','INCREASE','DECREASE'],
    DIRECTION:['INCREASE','DECREASE','ABSOLUTE','HISTORICAL_HIGH','HISTORICAL_LOW'],
    RANK:['RANK','RANK_GROUP','RANK_ENTITY','PEAK','HISTORICAL_HIGH','HISTORICAL_LOW'],
    EXCLUSION:['EXCLUDE','NEGATE'],RELATION:['DRIVER','ROOT','CHECK','AMOUNT']};
  const provenance={};
  for(const [key,concepts]of Object.entries(groups)){
    const spans=evidence(concepts);provenance[key]={origin:spans.length?'EXPLICIT':patch?'INHERITED_OR_RULE_DERIVED':'RULE_DERIVED_OR_DEFAULT',spans};
  }
  provenance.PERIOD={origin:meta.periodExplicit?'EXPLICIT':patch?'INHERITED_OR_PATCHED':'CONTEXT_OR_DEFAULT',
    anchor:clone(explain.temporalAnchor||{}),spans:clone(meta.periodSpans||[])};
  provenance.FILTER={origin:p.condition?'EXPLICIT_OR_INHERITED':'ABSENT',raw:p.condition?.raw||null};
  const historical=p.action==='HISTORICAL_GROUP_PEAK',ranking=['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK'].includes(p.action);
  return {version:COMPOSITION_VERSION,
    ACTION:p.action||null,
    TARGET:{level:p.dimension||(p.entityId?'ENTITY':p.groupId?'GROUP':null),groupId:p.groupId||null,entityId:p.entityId||null,
      comparisonIds:clone(p.comparisonIds||[]),candidateGroupIds:clone(p.candidateGroupIds||[]),candidateEntityIds:clone(p.candidateEntityIds||[])},
    MEASURE:{kind:p.metric||null,driver:p.driver||null,contributionShare:!!p.contributionShareRequested,
      basis:historical?'ADJACENT_MONTH_PERCENT_CHANGE':p.metric==='BALANCE'?'CLOSING_BALANCE':p.metric==='PERCENT'?'EXISTING_PERCENT_CHANGE_POLICY':'EXISTING_MOVEMENT_POLICY'},
    DIRECTION:p.direction||null,PERIOD:clone(p.period||null),
    RANK:ranking?{limit:p.topN,order:p.direction,withinGroupSelection:historical?(p.direction==='DOWN'?'MIN_MONTHLY_PERCENT':'MAX_MONTHLY_PERCENT'):null,
      acrossGroups:historical?'ORDER_SELECTED_MONTHLY_PERCENT':null}:null,
    FILTER:clone(p.condition||null),
    EXCLUSION:{groupIds:clone(p.excludedGroupIds||[]),entityIds:clone(p.excludedEntityIds||[]),drivers:clone(p.excludedDrivers||[])},
    RELATION:{driver:p.driver||null,checkMode:p.checkMode||null,negatedCheck:!!p.negatedCheck,contextPatch:clone(patch||null)},
    provenance,lexicalEvidence:clone(meta.additions||[]),unresolved:clone(explain.unknownTokens||[]),
    contradictions:clone(meta.contradictions||[])};
}
