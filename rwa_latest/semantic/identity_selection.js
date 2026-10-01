/** Explicit, request-local identity selection. No aliases are learned or stored globally.
 * Candidates come only from the current authorised index and already-loaded clients.
 * An explicit click resolves ONE original span, not the whole question or its conditions.
 */
import {Dictionary,identityCatalog} from './dictionary.js';
import {normalizedInput,norm,overlaps,tokenize,clone} from './text.js';

export const IDENTITY_SELECTION_VERSION='1.0.0';
const fail=message=>{const error=new Error(message);error.code='STALE_IDENTITY_SELECTION';throw error;};
const keyOf=t=>t.kind+':'+(t.kind==='ENTITY'?t.parentId+'/':'')+t.id;
const publicIdentity=t=>({key:t.key,kind:t.kind,id:t.id,name:t.name,parentId:t.parentId||'',parentName:t.parentName||''});
const compare=(a,b)=>a<b?-1:a>b?1:0;
function sortedTargets(items){return [...new Map(items.map(t=>[t.key,t])).values()]
  .sort((a,b)=>compare(a.kind==='GROUP'?0:1,b.kind==='GROUP'?0:1)||compare(norm(a.name),norm(b.name))||compare(a.parentId,b.parentId)||compare(a.id,b.id)).map(publicIdentity);}
function dictionaryFor(catalog,registry){
  const groupIds=new Set((catalog.groups||[]).map(g=>g.client_group_id));
  const authorised={...catalog,entities:(catalog.entities||[]).filter(e=>groupIds.has(e.client_group_id))};
  return new Dictionary(registry,identityCatalog([],authorised,{registry}),catalog.driverLabels||[]);
}
/** Literal prefix suggestions ONLY for a bare, unrecognised name (never a numeric ID,
 * financial keyword, date or a phrase inside a longer analytical question).
 */
function partialTargets(text,dict,lex){
  if(lex.names.length||lex.collisions.length||lex.matches.length||text.length<3||text.length>160)return [];
  if(!/^[\p{L}][\p{L} .&'-]*$/u.test(text))return [];
  const parts=tokenize(text).map(t=>t.text);
  if(!parts.length||parts.at(-1).length<3)return [];
  return dict.identities.filter(item=>item.aliases.some(alias=>{
    if(norm(alias)===norm(item.id))return false;
    const words=tokenize(norm(alias)).map(t=>t.text);
    return words.length>=parts.length&&parts.every((p,i)=>i===parts.length-1?words[i].startsWith(p):words[i]===p);
  }));
}
function collisionChoice(text,dict,lex){
  for(const collision of lex.collisions){
    const keys=new Set(collision.targets.map(keyOf));
    const h=dict.nameIndex.match(text).find(h=>h.text===collision.text&&!lex.names.some(n=>n.start===h.start&&n.end===h.end)&&h.entries.some(e=>keys.has(e.item.key)));
    if(!h)continue;
    const targets=dict.identities.filter(t=>keys.has(t.key));
    return {reason:'AMBIGUOUS_NAME',span:{start:h.start,end:h.end,text:h.text},targets:sortedTargets(targets)};
  }
  return null;
}

/** Make a temporary dictionary view. The base dictionary and its caches are untouched.
 * Typed identity keys, exact offsets and the original normalised query are revalidated
 * at routing, after loading, at preview, and at the existing confirmation reparse.
 */
export function bindIdentitySelection(dict,question,selection){
  if(selection==null)return dict;
  const input=normalizedInput(question,dict.registry.settings.max_query_chars);
  if(input.error)fail(input.error);
  if(selection.version!==IDENTITY_SELECTION_VERSION||selection.question!==input.text||!Array.isArray(selection.bindings)||
    !selection.bindings.length||selection.bindings.length>8)fail('The name selection is no longer valid for this question. Submit the question again.');
  const text=input.text,baseLex=dict.resolve(text),baseHits=dict.nameIndex.match(text),checked=[];
  for(const b of selection.bindings){
    if(!b||!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<0||b.end<=b.start||b.end>text.length||
      b.text!==text.slice(b.start,b.end)||checked.some(x=>overlaps(x,b)))fail('The selected name span changed. Submit the question again.');
    const item=dict.identities.find(t=>t.key===b.key&&t.key===keyOf(b));
    if(!item)fail('The selected group or client is no longer available in the authorised data. Submit the question again.');
    const named=baseLex.names.find(n=>n.start===b.start&&n.end===b.end&&n.item.key===item.key);
    const hit=baseHits.find(h=>h.start===b.start&&h.end===b.end&&h.entries.some(e=>e.item.key===item.key));
    const ambiguous=hit&&baseLex.collisions.some(c=>c.text===hit.text&&c.targets.some(t=>keyOf(t)===item.key));
    const partialLocation=(b.start===0&&b.end===text.length)||(b.end===text.length&&/\bfor\s+$/.test(text.slice(0,b.start)));
    const partial=b.match==='PARTIAL_NAME'&&partialLocation&&!baseLex.matches.some(m=>overlaps(m,b))&&
      partialTargets(b.text,dict,dict.resolve(b.text)).some(t=>t.key===item.key);
    if(!named&&!ambiguous&&!partial)fail('The selected identity no longer matches this part of the question. Choose again.');
    checked.push({...b,item});
  }
  const view=Object.create(dict);
  view.identitySelectionActive=true;
  view.nameIndex={match:(query,blocked=[])=>{
    if(query!==text)fail('Other wording changed after the name selection. Use the original question or submit a new one.');
    const active=checked.filter(b=>!blocked.some(s=>overlaps(s,b)));
    const hits=dict.nameIndex.match(query,blocked).filter(h=>!active.some(b=>overlaps(b,h)));
    for(const b of active)hits.push({start:b.start,end:b.end,text:b.text,entries:[{phrase:b.text,item:b.item,priority:100}]});
    return hits.sort((a,b)=>a.start-b.start);
  }};
  // Dictionary.resolve is inherited, so existing phrase/driver ownership rules still run.
  const resolved=view.resolve(text);
  if(checked.some(b=>!resolved.names.some(n=>n.start===b.start&&n.end===b.end&&n.item.key===b.item.key)))
    fail('The selected identity conflicts with a protected phrase or driver. Submit an explicit ID.');
  return view;
}

export function identityChoiceRequest(question,catalog,registry,selection=null){
  const input=normalizedInput(question,registry.settings.max_query_chars);
  if(input.error)return null;
  const base=dictionaryFor(catalog,registry),dict=bindIdentitySelection(base,question,selection),lex=dict.resolve(input.text);
  let choice=collisionChoice(input.text,dict,lex);
  if(!choice&&!selection){
    const targets=partialTargets(input.text,dict,lex);
    if(targets.length)choice={reason:'PARTIAL_NAME',span:{start:0,end:input.text.length,text:input.text},targets:sortedTargets(targets)};
  }
  if(!choice)return null;
  return {version:IDENTITY_SELECTION_VERSION,question:input.text,...choice,
    selection:selection?clone(selection):{version:IDENTITY_SELECTION_VERSION,question:input.text,bindings:[]}};
}
export function chooseIdentity(request,key){
  const target=request.targets.find(t=>t.key===key);
  if(!target)fail('Select one of the displayed authorised identities.');
  const selection=clone(request.selection);
  selection.bindings.push({...clone(request.span),match:request.reason,key:target.key,kind:target.kind,id:target.id,parentId:target.parentId});
  return selection;
}
/** Preserve an earlier missing-subject request when the user then selects a bare name. */
export function appendSelectedSubject(pending,question,selection){
  const prefix=norm(pending)+' for ',text=prefix+norm(question);
  return {question:text,selection:selection?{...clone(selection),question:text,
    bindings:selection.bindings.map(b=>({...b,start:b.start+prefix.length,end:b.end+prefix.length}))}:null};
}
