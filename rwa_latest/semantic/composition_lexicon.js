/** Gap-only lexical interpretation. No text rewrite, stemming, ID guessing or fuzzy expansion. */
import {aliasRe,normalizedInput,overlaps} from './text.js';
import {COMPOSITION_VERSION} from './composition_schema.js';
export function composeLexical(question,dictionary,registry){
  if(!registry.composition)return null;
  const input=normalizedInput(question,registry.settings.max_query_chars);
  if(input.error)return null;
  const exact=dictionary.resolve(input.text);
  if(exact.collisions.length)return null;
  const protectedSpans=[...exact.names,...exact.matches],found=[];
  for(const row of registry.composition.lexicalFamilies){
    if(!row.enabled)continue;
    for(const match of input.text.matchAll(aliasRe(row.phrase))){
      const span={start:match.index,end:match.index+match[0].length,text:match[0]};
      if(protectedSpans.some(p=>overlaps(p,span)))continue;
      // Politeness is a request prefix, not a disposable word anywhere in a sentence.
      if(row.role==='COURTESY'&&!/^(?:(?:could|can|would) you )?$/.test(input.text.slice(0,span.start)))continue;
      found.push({...span,concept:row.concept,weight:1,source:row.source,
        family:row.family_id,role:row.role});
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
  for(const hit of additions)concepts[hit.concept]=Math.max(concepts[hit.concept]||0,hit.weight);
  return {text:input.text,lex:{...exact,matches,concepts},
    fuzzy:{attempts:[],corrections:[]},
    phraseResolution:{policy:'Exact legacy ownership first; reviewed composition fills uncovered spans only.',
      matches:exact.matches.map(x=>({phrase:x.text,concept:x.concept,start:x.start,end:x.end}))},
    composition:{version:COMPOSITION_VERSION,additions}};
}
