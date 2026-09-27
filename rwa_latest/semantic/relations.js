import {uniq,overlaps,removeSpans} from './text.js';
/** Layer 4: domain relations; dictionary hits do not automatically become positive subject slots. */
export function parseRelations(text,lex,slots){
  const structuralText=removeSpans(text,lex.matches.filter(m=>m.driver));
  const errors=[],warnings=[];let names=slots.names.map(n=>({...n,role:'subject'})),drivers=slots.drivers.map(d=>({...d,role:'driver'}));
  const events=lex.matches.filter(m=>['EXCLUDE','INCLUDE','NEGATE'].includes(m.concept));
  const checkStart=/^(?:please\s+)?(?:was|were|did|is|are|has|have|does|do)\b/.test(text);
  let negatedCheck=false;
  for(let i=0;i<events.length;i++){
    const event=events[i];
    if(slots.threshold?.negated&&event.start>=slots.threshold.start&&event.end<=slots.threshold.end)continue;
    if(event.concept==='NEGATE'&&checkStart){negatedCheck=true;continue;}
    const end=events[i+1]?.start??text.length;
    const following=[...names,...drivers].filter(x=>x.start>=event.end&&x.start<end);
    // NOT only names a target here. Negating a period/direction is never discarded.
    const between=text.slice(event.end,following[0]?.start??end).trim();
    if(!following.length||event.concept==='NEGATE'&&between&&!/^(?:the|just)$/.test(between)){
      errors.push({code:'UNSUPPORTED_MODIFIER',message:'Specify an explicit group/entity/driver exclusion; negated periods or directions are not implemented.'});continue;
    }
    const role=event.concept==='INCLUDE'?'include':'exclude';
    for(const target of following){
      // Do not let an exclusion consume a later unrelated relation.
      const gap=text.slice(event.end,target.start);
      if(/\b(by|versus|vs|compare|compared|rather than)\b/.test(gap)){errors.push({code:'AMBIGUOUS_RELATION',message:'The exclusion scope is ambiguous. Put comparison/ranking conditions before exclusions.'});break;}
      target.role=role;
    }
  }
  if(events.some(e=>e.concept==='INCLUDE')&&events.some(e=>e.concept==='EXCLUDE'))errors.push({code:'AMBIGUOUS_RELATION',message:'Use separate include and exclude requests so their scopes are explicit.'});
  if([...structuralText.matchAll(/\bor\b/g)].some(m=>!lex.matches.some(x=>x.concept==='CONCENTRATION'&&m.index>=x.start&&m.index<x.end))&&!(slots.threshold?.text.includes('or equal')))errors.push({code:'UNSUPPORTED_MODIFIER',message:'Alternative OR conditions are not implemented. Use an explicit comparison or one condition.'});
  const subjects=names.filter(n=>n.role==='subject'),excluded=names.filter(n=>n.role==='exclude'),included=names.filter(n=>n.role==='include');
  const primaryDrivers=uniq(drivers.filter(d=>d.role==='driver').map(d=>d.driver));
  const explicitCompare=!!lex.concepts.COMPARE;
  if(primaryDrivers.length>1)errors.push({code:'UNSUPPORTED_MODIFIER',message:'Ask about one driver, or exclude multiple drivers explicitly. Multi-driver comparison is not implemented.'});
  if(lex.concepts.INCREASE&&lex.concepts.DECREASE)errors.push({code:'AMBIGUOUS_DIRECTION',message:'Both increase and decrease were requested; specify one direction or absolute movement.'});
  if(lex.concepts.BALANCE&&lex.concepts.PERCENT)errors.push({code:'AMBIGUOUS_METRIC',message:'Choose balance or percentage change, not both as a ranking metric.'});
  const entities=uniq(subjects.filter(n=>n.item.kind==='ENTITY').map(n=>n.item.key)),groups=uniq(subjects.filter(n=>n.item.kind==='GROUP').map(n=>n.item.id));
  if(subjects.some(n=>n.item.kind==='ENTITY'&&groups.length&&!groups.includes(n.item.parentId)))errors.push({code:'AMBIGUOUS_ENTITY',message:'The entity and group do not match. Use one group or a supported comparison.'});
  const scopes=[...new Map(subjects.map(n=>[n.item.key,n.item])).values()];
  const hasThreshold=!!slots.threshold;
  const check=checkStart&&primaryDrivers.length>0&&!/\bwhy\b/.test(text)&&!explicitCompare;
  const sameBasis=!!lex.concepts.SAME;
  return {names,drivers,subjects:scopes,excluded:excluded.map(n=>n.item),included:included.map(n=>n.item),
    excludedDrivers:uniq(drivers.filter(d=>d.role==='exclude').map(d=>d.driver)),includedDrivers:uniq(drivers.filter(d=>d.role==='include').map(d=>d.driver)),
    driver:primaryDrivers[0]||null,explicitCompare,check,checkMode:lex.concepts.SOLE||/\bonly\b/.test(text)&&check?'SOLE':lex.concepts.MAIN?'MAIN':'CONTRIBUTES',
    movementCheck:checkStart&&!primaryDrivers.length&&!['ROOT','TREND','CONCENTRATION','OFFSETS','RECONCILE','PEAK','MAIN','RANK','RANK_GROUP','RANK_ENTITY','AMOUNT'].some(c=>lex.concepts[c])&&!explicitCompare&&!!(lex.concepts.INCREASE||lex.concepts.DECREASE),negatedCheck,entities,groups,hasThreshold,sameBasis,errors,warnings};
}
