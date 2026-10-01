/** Bounded deterministic semantic candidate graph. No probabilities or executor calls. */
import {clone} from './text.js';
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const MATERIAL_FIELDS=new Set(['metric','driver','condition','excludedDrivers','groupId','entityId','period','dimension']);
export function predicateTree(plan){
  const children=[];
  if(plan?.condition)children.push({type:'PREDICATE',targetLevel:plan.dimension||null,metric:plan.condition.metric||'CHANGE',operator:plan.condition.op,value:plan.condition.value,canonicalValue:plan.condition.canonicalValue,unit:plan.condition.unit||null});
  for(const driver of plan?.excludedDrivers||[])children.push({type:'EXCLUSION',target:'DRIVER_ATTRIBUTION',value:driver});
  for(const id of plan?.excludedGroupIds||[])children.push({type:'EXCLUSION',target:'GROUP',id});
  for(const id of plan?.excludedEntityIds||[])children.push({type:'EXCLUSION',target:'ENTITY',id});
  return {type:'AND',children};
}
export function relationTree(plan){
  const children=[];
  if(['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK'].includes(plan?.action))children.push({type:'RANK_BY',metric:plan.metric,driver:plan.driver||null,direction:plan.direction,limit:plan.topN});
  if(plan?.driver)children.push({type:'DRIVER_ROLE',role:'MEASURE_OR_QUERY_TARGET',driver:plan.driver});
  if(plan?.excludedDrivers?.length)children.push({type:'ATTRIBUTION_EXCLUSION',drivers:clone(plan.excludedDrivers)});
  return {type:'RELATIONS',children};
}
export function semanticCandidate(label,plan,source='DETERMINISTIC'){
  return {label,source,ACTION:plan?.action||null,TARGET:{level:plan?.dimension||(plan?.entityId?'ENTITY':plan?.groupId?'GROUP':null),groupId:plan?.groupId||null,entityId:plan?.entityId||null},
    MEASURE:{metric:plan?.metric||null,driver:plan?.driver||null},DIRECTION:plan?.direction||null,PERIOD:clone(plan?.period||null),RANK:['TOP_CLIENTS','TOP_ENTITY','HISTORICAL_GROUP_PEAK'].includes(plan?.action)?{limit:plan.topN,order:plan.direction}:null,
    PREDICATES:predicateTree(plan),RELATIONS:relationTree(plan)};
}
export function buildCandidateGraph(legacyPlan,structuredPlan,maxCandidates=4){
  const raw=[];if(legacyPlan)raw.push(semanticCandidate('LEGACY',legacyPlan,'LEGACY_PIPELINE'));if(structuredPlan)raw.push(semanticCandidate('STRUCTURED',structuredPlan,'FRAME_FIRST'));
  const candidates=[];for(const c of raw){if(!candidates.some(x=>same(x,c))){candidates.push(c);if(candidates.length>maxCandidates)break;}}
  const disagreements=[];
  if(legacyPlan&&structuredPlan)for(const field of ['action','metric','driver','condition','excludedDrivers','groupId','entityId','period','dimension'])if(!same(legacyPlan[field]??null,structuredPlan[field]??null))disagreements.push({field,legacy:clone(legacyPlan[field]??null),structured:clone(structuredPlan[field]??null),material:MATERIAL_FIELDS.has(field)});
  return {policy:'BOUNDED_DETERMINISTIC',maxCandidates,candidates,disagreements,ambiguous:candidates.length>1&&disagreements.some(x=>x.material)};
}
export function materialFinding(findings=[]){return findings.find(f=>f.code==='UNDEFINED_AGGREGATION_BASIS'||f.code==='ROLE_BINDING_DISAGREEMENT'&&MATERIAL_FIELDS.has(f.field))||null;}
