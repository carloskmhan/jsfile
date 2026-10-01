/** Optional artifact validation mirrors tools/composition_rules.py. No executable CSV code. */
export const COMPOSITION_VERSION='6.3.0-semantic-generalization-review';
export const COMPOSITION_FAMILIES=Object.freeze({
  RISE:['INCREASE','MOTION_UP'], RISE_LEMMA:['INCREASE','MOTION_UP'], CAUSE_UP:['ROOT','ATTRIBUTION'],
  FALL:['DECREASE','MOTION_DOWN'], FALL_LEMMA:['DECREASE','MOTION_DOWN'], CAUSE_DOWN:['ROOT','ATTRIBUTION'],
  CAUSE:['ROOT','ATTRIBUTION'], CAUSE_LEMMA:['ROOT','ATTRIBUTION'], CONTRIBUTION:['AMOUNT','CONTRIBUTION'], CONTRIBUTION_LEMMA:['AMOUNT','CONTRIBUTION'], POLITE:['COURTESY','COURTESY'],
  SUBJECT_LINK:['TECHNICAL','SUBJECT_LINK'], PATCH_LINK:['TECHNICAL','PATCH_LINK']
});
export const COMPOSITION_SHAPES=Object.freeze({
  ATTRIBUTION:['GROUP_ROOT_CAUSE','ENTITY_DRIVER','MAIN_DRIVER'],
  MOVEMENT_CHECK:['MOVEMENT_CHECK','DRIVER_CHECK'],
  CONTRIBUTION:['DRIVER_CONTRIBUTION','ENTITY_CONTRIBUTION'], RANKING:['TOP_CLIENTS','TOP_ENTITY'],
  CONTEXT_MODIFIER:['GROUP_ROOT_CAUSE','ENTITY_DRIVER','TOP_CLIENTS','TOP_ENTITY'],
  RANKING_ROLES:['TOP_CLIENTS','TOP_ENTITY'],
  COMPOUND_CONTEXT:['GROUP_ROOT_CAUSE','ENTITY_DRIVER','TOP_ENTITY'],
  REFERENCE_CONTEXT:['TOP_CLIENTS','TOP_ENTITY'],
  ACCEPTED_AUDIT:[], CONSISTENCY_GATE:[]
});
const protectedWords=new Set(('not no never without except excluding exclude include only net gross '+
  'cumulative forecast predict future if unless assuming balance percentage percent absolute '+
  'rwa ead pd lgd fx cg maturity january february march april may june july august september '+
  'october november december').split(' '));
export function compositionMode(value='off'){
  if(!['off','shadow','guarded'].includes(value))throw new Error('compositionMode must be off, shadow or guarded.');
  return value;
}
export function validateComposition(c,registry){
  if(c===undefined)return;
  const bad=()=>{throw new Error('Invalid composition artifact. Rebuild reviewed optional CSV rules.');};
  if(!c||c.schemaVersion!==1||c.maxMatches!==16||c.maxCandidates!==4||
     !Array.isArray(c.lexicalFamilies)||c.lexicalFamilies.length>256||!Array.isArray(c.rules)||c.rules.length>16)bad();
  const phrases=new Set(),ids=new Set(),shapes=new Set();
  const exact=new Map(registry.synonyms.filter(s=>s.enabled).map(s=>[s.phrase,s.concept]));
  for(const row of c.lexicalFamilies){
    const pair=COMPOSITION_FAMILIES[row.family_id];
    if(!pair||pair[0]!==row.concept||pair[1]!==row.role||typeof row.phrase!=='string'||
      !/^[a-z]+(?: [a-z]+){0,3}$/.test(row.phrase)||row.phrase.length>64||
      row.phrase.split(' ').some(w=>protectedWords.has(w))||phrases.has(row.phrase)||
      typeof row.enabled!=='boolean'||exact.has(row.phrase)&&exact.get(row.phrase)!==row.concept)bad();
    if(['SUBJECT_LINK','PATCH_LINK'].includes(row.family_id)&&row.phrase!==({SUBJECT_LINK:'whose',PATCH_LINK:'but'})[row.family_id])bad();
    phrases.add(row.phrase);
    if(row.source?.file!=='lexical_families.csv'||!Number.isInteger(row.source.line)||row.source.line<2)bad();
  }
  for(const row of c.rules){
    if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(row.rule_id)||ids.has(row.rule_id)||shapes.has(row.shape)||
      !Object.hasOwn(COMPOSITION_SHAPES,row.shape)||JSON.stringify(row.actions)!==JSON.stringify(COMPOSITION_SHAPES[row.shape])||
      typeof row.enabled!=='boolean'||row.source?.file!=='composition_rules.csv'||!Number.isInteger(row.source.line)||row.source.line<2)bad();
    ids.add(row.rule_id);shapes.add(row.shape);
  }
}
