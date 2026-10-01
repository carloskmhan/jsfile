/** Gap-only lexical interpretation. No text rewrite, ID guessing or fuzzy expansion. */
import {aliasRe,normalizedInput,overlaps} from './text.js';
import {COMPOSITION_VERSION} from './composition_schema.js';
import {abstractionPath,productiveForms,secondaryConcepts} from './abstraction.js';
export function composeLexical(question,dictionary,registry){
  if(!registry.composition)return null;
  const input=normalizedInput(question,registry.settings.max_query_chars);
  if(input.error)return null;
  const exact=dictionary.resolve(input.text);
  if(exact.collisions.length)return null;
  const protectedIdentity=[...exact.names,...exact.matches.filter(m=>m.driver)],found=[];
  for(const row of registry.composition.lexicalFamilies){
    if(!row.enabled)continue;
    for(const form of productiveForms(row.phrase,row.family_id))for(const match of input.text.matchAll(aliasRe(form))){
      const span={start:match.index,end:match.index+match[0].length,text:match[0]};
      if(protectedIdentity.some(p=>overlaps(p,span)))continue;
      const secondary=secondaryConcepts(row.family_id),allowed=new Set([row.concept,...secondary]);
      const conflicts=exact.matches.filter(p=>overlaps(p,span)&&!p.driver);
      // A longer reviewed abstraction may absorb an exact subphrase only when the
      // subphrase is fully contained and semantically compatible. Names/IDs/drivers
      // above remain absolute owners, and conflicting concepts still block recovery.
      if(conflicts.some(p=>p.start<span.start||p.end>span.end||!allowed.has(p.concept)))continue;
      if(row.role==='COURTESY'&&!/^(?:(?:could|can|would) you )?$/.test(input.text.slice(0,span.start)))continue;
      found.push({...span,concept:row.concept,weight:1,source:row.source,
        family:row.family_id,role:row.role,lemma:row.phrase,derived:form!==row.phrase,
        abstractionPath:abstractionPath(row.family_id),secondaryConcepts:secondary});
    }
  }
  found.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start)||a.family.localeCompare(b.family));
  const additions=[];
  for(const hit of found){
    if(additions.some(p=>overlaps(p,hit)))continue;
    additions.push(hit);
    if(additions.length>registry.composition.maxMatches)return {error:'COMPOSITION_LIMIT'};
  }
  if(!additions.length)return null;
  const matches=[...exact.matches,...additions].sort((a,b)=>a.start-b.start),concepts={...exact.concepts};
  for(const hit of additions){
    concepts[hit.concept]=Math.max(concepts[hit.concept]||0,hit.weight);
    for(const secondary of hit.secondaryConcepts)concepts[secondary]=Math.max(concepts[secondary]||0,hit.weight);
  }
  return {text:input.text,lex:{...exact,matches,concepts},
    fuzzy:{attempts:[],corrections:[]},
    phraseResolution:{policy:'Exact legacy ownership first; reviewed abstractions and productive morphology fill uncovered spans only.',
      matches:exact.matches.map(x=>({phrase:x.text,concept:x.concept,start:x.start,end:x.end}))},
    composition:{version:COMPOSITION_VERSION,additions}};
}
