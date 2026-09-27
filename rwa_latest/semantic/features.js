/** Layer 5: named, inspectable features. Coordinates are concepts, not learned embeddings. */
export function semanticFeatures(lex,slots,relations,patch=null){
  const f={...lex.concepts},put=(key,value=1)=>{f[key]=Math.max(f[key]||0,value);};
  const subjects=relations.subjects,hasEntity=subjects.some(x=>x.kind==='ENTITY');
  const periodCompare=slots.period?.mode==='comparison';
  const rank=(!!f.RANK||!!f.RANK_GROUP||!!f.RANK_ENTITY||!!slots.threshold&&!!slots.dimension)&&(!!slots.dimension||!subjects.length);
  const rankEntity=rank&&['ENTITY','PRODUCT','LOCATION'].includes(slots.dimension);
  const rankGroup=rank&&slots.dimension==='GROUP';
  if(rankEntity)put('RANK_ENTITY');if(rankGroup)put('RANK_GROUP');
  if(relations.explicitCompare||periodCompare)put('COMPARE_REQUEST');
  if(f.TREND)put('TREND_REQUEST',f.TREND);
  if(f.PEAK)put('PEAK_REQUEST',f.PEAK);
  if(f.OFFSETS)put('OFFSETS_REQUEST',f.OFFSETS);
  if(f.RECONCILE)put('RECONCILE_REQUEST',f.RECONCILE);
  if(f.CONCENTRATION)put('CONCENTRATION_REQUEST',f.CONCENTRATION);
  if(relations.check)put('DRIVER_CHECK_REQUEST');
  if(relations.movementCheck)put('MOVEMENT_CHECK_REQUEST');
  if(relations.driver&&f.AMOUNT&&!relations.check&&!rank&&!f.ROOT&&!f.COMPARE)put('DRIVER_AMOUNT');
  if(!relations.driver&&f.AMOUNT&&(hasEntity||f.ENTITY)&&!rank&&!f.ROOT&&!f.COMPARE)put('ENTITY_AMOUNT');
  if(f.MAIN&&!relations.check&&!rankEntity&&!rankGroup&&!f.COMPARE)put('MAIN_DRIVER_REQUEST');
  if(f.ROOT&&!f.MAIN&&!rankEntity&&!rankGroup&&!relations.check&&!periodCompare&&!f.TREND&&!f.PEAK&&!f.OFFSETS&&!f.RECONCILE&&!f.CONCENTRATION)put('RWA_DRIVER',f.ROOT);
  // Balance/amount query is a fixed recorded-movement report, never a causal inference.
  if(!f.RWA_DRIVER&&!f.MAIN&&((f.AMOUNT&&!relations.driver&&!hasEntity)||f.BALANCE)&&!rank&&!f.COMPARE&&!f.PEAK)put('RWA_DRIVER');
  if(f.AMOUNT&&!relations.driver&&!hasEntity&&!rank&&!f.COMPARE&&!f.ROOT){delete f.RWA_DRIVER;put('MOVEMENT_AMOUNT_REQUEST');}
  if(relations.movementCheck){delete f.RWA_DRIVER;delete f.MOVEMENT_AMOUNT_REQUEST;}
  if(subjects.length>1)put('TWO_SUBJECTS');if(hasEntity)put('HAS_ENTITY');
  if(slots.period)put('HAS_PERIOD');if(relations.excluded.length||relations.excludedDrivers.length||slots.threshold)put('HAS_MODIFIER');
  if(periodCompare)put('PERIOD_COMPARISON');
  return f;
}
