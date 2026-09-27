import {catalogLookup,resolveCatalogGroup} from '../group_catalog.js';
import {driverCatalog} from '../driver_catalog.js';
import {Dictionary,identityCatalog} from './dictionary.js';
import {norm,uniq,normalizedInput} from './text.js';
import {prepareLexical} from './lexical.js';
import {detectUnsupported} from './validation.js';
const routingCache=new WeakMap();
/** Select authorised data to load. This is not a financial answer and never reuses result amounts. */
export function planDataRequest(question,catalog,registry,state={},context={}){
  const input=normalizedInput(question,registry.settings.max_query_chars);if(input.error)return {ok:false,code:input.code,message:input.error};
  let cached=routingCache.get(catalog);
  if(!cached||cached.registry!==registry){const identities=identityCatalog([],catalog,{registry});cached={registry,identities,dict:new Dictionary(registry,identities,catalog.driverLabels||[])};routingCache.set(catalog,cached);}
  const {identities,dict}=cached;let prepared=prepareLexical(norm(question),dict);
  if(prepared.error?.code==='UNSUPPORTED_EXPRESSION'){const exact=dict.resolve(input.text);if(exact.names.length)prepared={text:input.text,lex:exact};} // Final interpretation still consumes and validates every word after detail load.
  if(prepared.error)return {ok:false,...prepared.error};
  const text=prepared.text,lex=prepared.lex;
  if(lex.collisions.length)return{ok:false,code:'AMBIGUOUS_ENTITY',message:'This name matches multiple IDs. Specify one of: '+lex.collisions.flatMap(c=>c.targets).slice(0,8).map(t=>t.kind+' '+t.id+' ('+t.name+')').join('; ')};
  const unsupported=detectUnsupported(lex,text);if(unsupported)return{ok:false,...unsupported};
  const exclusion=lex.matches.find(m=>m.concept==='EXCLUDE'||m.concept==='NEGATE'&&!/^(was|is|did|were)\b/.test(text));
  const subjects=lex.names.filter(n=>!exclusion||n.start<exclusion.start).map(n=>n.item);
  let ids=uniq(subjects.map(s=>s.kind==='GROUP'?s.id:s.parentId));
  const comparing=!!lex.concepts.COMPARE;
  if(comparing){
    let reference=null;
    if(/\b(first|second|third|largest one|next one)\b/.test(text)){
      const index=/second/.test(text)?1:/third/.test(text)?2:/next/.test(text)?(state.focusRankIndex??0)+1:0;reference=state.references?.[index];
      if(!reference)return{ok:false,code:'AMBIGUOUS_CONTEXT',message:'The requested result reference is not available.'};
      ids.push(reference.kind==='GROUP'?reference.id:reference.parentId);
    }else if(/\b(the two|both|them)\b/.test(text))ids.push(...(state.comparisonSubjects||[]).map(x=>x.kind==='GROUP'?x.id:x.parentId));
    else if(/\b(it|that)\b/.test(text)&&state.groupId)ids.push(state.groupId);
  }
  const inheritedPortfolio=state.action==='TOP_CLIENTS'&&!subjects.length&&!comparing&&/^(only|same|and|what about|how about|rank those|sort those|which of those|exclude|include|clear|top \d+ instead)/.test(text);
  const portfolio=(!!lex.concepts.RANK&&!!lex.concepts.GROUP||!!lex.concepts.RANK_GROUP)&&!comparing||/\b(peers?|benchmark|portfolio|other groups)\b/.test(text)||inheritedPortfolio;
  if(!ids.length&&!portfolio){
    let selected;try{selected=resolveCatalogGroup(context.selectedClientGroupId||context.selectedClientGroup,catalog);}catch(e){return{ok:false,code:'AMBIGUOUS_ENTITY',message:e.message};}
    const id=selected?.client_group_id||state.groupId;if(id)ids=[id];
  }
  ids=uniq(ids);
  if(ids.length>2&&!portfolio)return{ok:false,code:'UNSUPPORTED_COMPARISON',message:'At most two groups can be loaded for a comparison.'};
  if(ids.some(id=>!catalogLookup(catalog).byId.has(id)))return{ok:false,code:'UNKNOWN_ENTITY',message:'A requested group is missing from the authorised catalog.'};
  if(!portfolio&&!ids.length)return{ok:false,code:'MISSING_REQUIRED_SLOT',message:'Which client group should I analyse? Enter its full name or ID.'};
  return{ok:true,portfolio,groupIds:ids,groups:ids.map(id=>catalogLookup(catalog).byId.get(id))};
}
