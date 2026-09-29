import {norm,tokenize,uniq,overlaps} from './text.js';
/** Layer 2: exact literal trie lookup, longest phrase first. No frequency fitting or embeddings. */
export class PhraseIndex {
  constructor(entries) {
    this.root=new Map();
    for(const entry of entries){
      const words=tokenize(norm(entry.phrase)).map(t=>t.text);if(!words.length)continue;
      let node=this.root;
      for(const word of words){if(!node.has(word))node.set(word,new Map());node=node.get(word);}
      if(!node.has(''))node.set('',[]);node.get('').push(entry);
    }
  }
  match(text,blocked=[]) {
    const tokens=tokenize(text),out=[];
    for(let i=0;i<tokens.length;i++){
      if(blocked.some(s=>overlaps(s,tokens[i])))continue;
      let node=this.root,last=null;
      for(let j=i;j<tokens.length;j++){
        if(blocked.some(s=>overlaps(s,tokens[j]))||!node.has(tokens[j].text))break;
        node=node.get(tokens[j].text);
        if(node.has(''))last={start:tokens[i].start,end:tokens[j].end,text:text.slice(tokens[i].start,tokens[j].end),entries:node.get(''),last:j};
      }
      if(last){out.push(last);i=last.last;}
    }
    return out;
  }
}
export function identityCatalog(rows=[],catalog=null,options={}) {
  const identities=new Map();
  const add=(kind,id,name,parentId='',parentName='',aliases=[])=>{
    if(!id||!name)return;
    const key=kind+':'+(kind==='ENTITY'?parentId+'/':'')+id;
    if(!identities.has(key))identities.set(key,{key,kind,id,name,parentId,parentName,aliases:[]});
    const old=identities.get(key);old.aliases=uniq([...old.aliases,id,name,...aliases].filter(Boolean));
  };
  for(const g of catalog?.groups||[])add('GROUP',g.client_group_id,g.client_group_name,'','',g.aliases||[]);
  const groupMap=new Map((catalog?.groups||[]).map(g=>[g.client_group_id,g]));
  for(const e of catalog?.entities||[]){const g=groupMap.get(e.client_group_id);add('ENTITY',e.entity_id,e.entity,e.client_group_id,g?.client_group_name||'',e.aliases||[]);}
  for(const row of rows){
    const gid=row.client_group_id||row.client_group;
    add('GROUP',gid,row.client_group,'','',options.registry?.identitySource==='runtime_catalog'?[]:(options.groupAliases?.[row.client_group]||[]));
    add('ENTITY',row.entity_id||row.entity,row.entity,gid,row.client_group,options.registry?.identitySource==='runtime_catalog'?[]:(options.entityAliases?.[row.entity]||[]));
  }
  // CSV aliases bind only to existing IDs; never manufacture an authorised target.
  for(const a of options.registry?.identitySource==='runtime_catalog'?[]:options.registry?.aliases||[]){
    if(!a.enabled)continue;
    const key=a.kind+':'+(a.kind==='ENTITY'?a.parent_id+'/':'')+a.canonical_id;
    const identity=identities.get(key);
    if(identity)identity.aliases=uniq([...identity.aliases,a.alias]);
  }
  return [...identities.values()];
}
export class Dictionary {
  constructor(registry,identities,drivers=[]){
    this.registry=registry;this.identities=identities;
    const reserved=new Set(registry.synonyms.filter(s=>s.enabled).map(s=>s.phrase));
    const entry=(item,phrase)=>{
      const text=norm(phrase),full=norm(item.name),base=full.replace(/(?:\s+(?:group|inc|incorporated|limited|ltd|plc|corporation|corp|co))+$/u,'').trim();
      const priority=text===norm(item.id)?100:text===full?80:text===base?60:text.includes(' ')?40:20;
      return priority===20&&reserved.has(text)?null:{phrase,item,priority};
    };
    this.nameIndex=new PhraseIndex(identities.flatMap(item=>item.aliases.map(phrase=>entry(item,phrase)).filter(Boolean)));
    this.conceptIndex=new PhraseIndex(registry.synonyms.filter(s=>s.enabled));
    this.driverIndex=new PhraseIndex(drivers.map(d=>({phrase:d.label,driver:d.label,driverKind:d.kind})));
    this.source='runtime authorised catalog';
  }
  resolve(text){
    let hits=this.nameIndex.match(text);
    // Patch 6.0.9-phrase-ownership: an enabled, exact multi-word rule owns
    // its span before a weak name fragment does. For example, registered
    // "take me through" must not turn "take" into TAKE HOME ELECTRONICS.
    // Keep IDs (100), full names (80), base names (60) and multi-word aliases
    // (40) protected. Only contained low-priority fragments (20) are shadowed;
    // the same fragment outside this phrase is still resolved normally.
    // No stop-word blacklist, guessed phrase, threshold change or token skip.
    const isFragment=h=>h.entries.every(e=>e.priority===20);
    const rulePhrases=this.conceptIndex.match(text,hits.filter(h=>!isFragment(h)))
      .filter(h=>tokenize(h.text).length>1);
    hits=hits.filter(h=>!isFragment(h)||!rulePhrases.some(p=>p.start<=h.start&&h.end<=p.end));
    // Whole detailed driver labels are protected before words such as increase,
    // lower, product, exclude, or dates inside a label acquire command meaning.
    const conceptHits=this.conceptIndex.match(text,hits);
    const driverHits=this.driverIndex.match(text).filter(d=>!hits.some(n=>overlaps(n,d)&&(n.end-n.start)>=(d.end-d.start))&&!conceptHits.some(c=>overlaps(c,d)&&(c.end-c.start)>(d.end-d.start)));
    hits=hits.filter(n=>!driverHits.some(d=>overlaps(n,d)));
    const names=[],collisions=[];
    const explicitIds=new Set(hits.flatMap(h=>h.entries.filter(e=>norm(e.item.id)===norm(h.text)).map(e=>e.item.key)));
    for(const h of hits){
      const priority=Math.max(...h.entries.map(e=>e.priority||0));
      let targets=[...new Map(h.entries.filter(e=>(e.priority||0)===priority).map(e=>[e.item.key,e.item])).values()];
      const own=targets.filter(t=>norm(t.id)===norm(h.text));if(own.length)targets=own;
      const explicitParents=new Set(hits.flatMap(n=>n.entries.filter(e=>e.item.kind==='GROUP'&&explicitIds.has(e.item.key)).map(e=>e.item.id)));
      if(targets.every(t=>t.kind==='ENTITY')&&explicitParents.size===1){const scoped=targets.filter(t=>explicitParents.has(t.parentId));if(scoped.length)targets=scoped;}
      const pinned=targets.filter(t=>explicitIds.has(t.key));if(pinned.length===1)targets=pinned;
      if(targets.length>1)collisions.push({text:h.text,targets:targets.map(x=>({kind:x.kind,id:x.id,name:x.name,parentId:x.parentId}))});
      else names.push({...h,item:targets[0],entries:undefined});
    }
    const matches=this.conceptIndex.match(text,[...hits,...driverHits]).map(h=>({...h,concept:h.entries[0].concept,weight:h.entries[0].weight,source:h.entries[0].source,entries:undefined}));
    for(const h of driverHits)matches.push({...h,concept:'DRIVER_DYNAMIC',driver:h.entries[0].driver,driverKind:h.entries[0].driverKind,weight:1,source:{file:'authorised json_data.drivers'},entries:undefined});
    matches.sort((a,b)=>a.start-b.start);
    const concepts=Object.create(null);for(const m of matches)concepts[m.concept]=Math.max(concepts[m.concept]||0,m.weight);
    return {names,matches,concepts,collisions};
  }
}
/** Compatibility helpers retained for callers; ambiguity is preserved rather than picking a target. */
export function findNames(q,items){
  const idx=new PhraseIndex(items.flatMap(item=>uniq(item.aliases||[]).map(phrase=>({phrase,item}))));
  return idx.match(norm(q)).flatMap(h=>[...new Map(h.entries.map(e=>[e.item.key,e.item])).values()].map(item=>({...item,start:h.start,end:h.end,text:h.text})));
}
export function catalogMentions(q,groups){return findNames(q,groups.map(g=>({key:g.client_group_id,name:g.client_group_name,kind:'group',aliases:[g.client_group_id,g.client_group_name,...(g.aliases||[])]})));}
