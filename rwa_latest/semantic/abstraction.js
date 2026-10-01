/** Deterministic semantic abstraction hierarchy for reviewed lexical families.
 * Surface forms never become executable intent by themselves; they only contribute
 * typed concepts that still pass the existing grammar/constraint pipeline.
 */
export const ABSTRACTION_PATHS=Object.freeze({
  RISE:['MOTION','UP'],RISE_LEMMA:['MOTION','UP'],CAUSE_UP:['RELATION','ATTRIBUTION','MOTION_UP'],
  FALL:['MOTION','DOWN'],FALL_LEMMA:['MOTION','DOWN'],CAUSE_DOWN:['RELATION','ATTRIBUTION','MOTION_DOWN'],
  CAUSE:['RELATION','ATTRIBUTION'],CAUSE_LEMMA:['RELATION','ATTRIBUTION'],
  CONTRIBUTION:['RELATION','CONTRIBUTION'],CONTRIBUTION_LEMMA:['RELATION','CONTRIBUTION'],
  POLITE:['DISCOURSE','COURTESY'],SUBJECT_LINK:['SYNTAX','SUBJECT_LINK'],PATCH_LINK:['SYNTAX','PATCH_LINK']
});
export const SECONDARY_CONCEPTS=Object.freeze({CAUSE_UP:['INCREASE'],CAUSE_DOWN:['DECREASE']});
export function abstractionPath(family){return ABSTRACTION_PATHS[family]||['LEXICAL',family];}
export function secondaryConcepts(family){return SECONDARY_CONCEPTS[family]||[];}

/** Productive morphology is allowed only for explicitly curated *_LEMMA families. */
export function productiveForms(phrase,family){
  if(!family.endsWith('_LEMMA')||!/^[a-z]+$/.test(phrase))return [phrase];
  const irregular={
    rise:['rise','rises','rose','risen','rising'],grow:['grow','grows','grew','grown','growing'],
    fall:['fall','falls','fell','fallen','falling'],shrink:['shrink','shrinks','shrank','shrunk','shrinking'],
    drive:['drive','drives','drove','driven','driving'],fuel:['fuel','fuels','fueled','fuelled','fueling','fuelling'],
    dip:['dip','dips','dipped','dipping'],stop:['stop','stops','stopped','stopping']
  };
  if(irregular[phrase])return irregular[phrase];
  if(phrase.endsWith('e'))return [phrase,phrase+'s',phrase+'d',phrase.slice(0,-1)+'ing'];
  if(/[^aeiou]y$/.test(phrase))return [phrase,phrase.slice(0,-1)+'ies',phrase.slice(0,-1)+'ied',phrase+'ing'];
  return [phrase,phrase+'s',phrase+'ed',phrase+'ing'];
}
