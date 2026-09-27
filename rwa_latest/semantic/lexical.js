/** Exact identity/literal phrase recognition precedes bounded fuzzy recovery in BOTH loading and parsing. */
import {recoverTypos} from './fuzzy.js';
export function prepareLexical(text,dict,options={}){
  const exact=dict.resolve(text);
  const resolution={policy:'identity-protected, leftmost-longest non-overlapping phrase; equal-span ambiguity is never guessed',matches:exact.matches.map(x=>({phrase:x.text,concept:x.concept,start:x.start,end:x.end}))};
  if(exact.collisions.length)return {text,lex:exact,fuzzy:{attempts:[],corrections:[]},phraseResolution:resolution};
  const fuzzy=recoverTypos(text,dict,exact,options),lex=fuzzy.corrections.length&&!fuzzy.error?dict.resolve(fuzzy.text):exact;
  return {text:fuzzy.text,lex,fuzzy,phraseResolution:resolution,error:fuzzy.error};
}
