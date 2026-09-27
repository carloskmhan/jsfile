import {norm,escapeRe,clone,uniq} from './text.js';
import {shiftMonth} from './periods.js';
/** Layers 10/state: only approved patch operations. No result amounts are copied into a plan. */
function patternMatch(pattern,text,values){
  const captures=[];let offset=0,rx='^';
  for(const m of pattern.matchAll(/\{([^{}]+)\}/g)){
    rx+=escapeRe(pattern.slice(offset,m.index)).replace(/ /g,'\\s+');
    const choices=values[m[1]]||[];if(!choices.length)return null;
    rx+='('+choices.map(x=>escapeRe(x.text)).sort((a,b)=>b.length-a.length).join('|')+')';captures.push(m[1]);offset=m.index+m[0].length;
  }
  rx+=escapeRe(pattern.slice(offset)).replace(/ /g,'\\s+')+'$';
  const match=new RegExp(rx,'u').exec(text);if(!match)return null;
  return Object.fromEntries(captures.map((k,i)=>[k,(values[k]||[]).find(x=>x.text===match[i+1])]));
}
export function findFollowup(text,slots,relations,registry,lex){
  const q=text.replace(/[?.!]+$/g,'').trim().replace(/^(?:please |could you please |can you please )/,'');
  const values={scope:slots.names.map(n=>({text:n.text,value:n.item})),other_scope:slots.names.map(n=>({text:n.text,value:n.item})),
    period:slots.periodSpans.map(s=>({text:s.text,value:slots.period})),driver:slots.drivers.map(s=>({text:s.text,value:s.driver})),
    threshold:slots.threshold?[{text:slots.threshold.text,value:slots.threshold}]:[],rankref:slots.references.map(s=>({text:s.text,value:s.index})),
    n:slots.topSpan?[{text:slots.topSpan.text,value:slots.topN}]:[],metric:lex.matches.filter(m=>['PERCENT','BALANCE'].includes(m.concept)).map(m=>({text:m.text,value:slots.metric}))};
  const variants=[q];let shorter=q;
  // Finite modifier stripping enables composition without a catch-all wildcard or ignored tokens.
  for(let i=0;i<3;i++){
    const periods=slots.periodSpans.map(s=>escapeRe(s.text)).join('|');
    const excluded=[...relations.excluded.map(x=>slots.names.find(n=>n.item.key===x.key)?.text),...slots.drivers.filter(d=>relations.excludedDrivers.includes(d.driver)).map(d=>d.text)].filter(Boolean).map(escapeRe).join('|');
    let next=shorter;
    if(excluded)next=next.replace(new RegExp('\\s+(?:excluding|exclude|without|except|leaving out)\\s+(?:'+excluded+')(?:\\s+and\\s+(?:'+excluded+'))*$','u'),'');
    if(periods)next=next.replace(new RegExp('\\s+(?:in|for|on)\\s+(?:'+periods+')$','u'),'');
    next=next.replace(/\s+(?:in one sentence|in one line|briefly|in detail)$/,'');
    if(next===shorter)break;shorter=next;variants.push(shorter);
  }
  const hits=[];
  for(const r of registry.followups.filter(r=>r.enabled))for(const variant of variants){
    const captures=patternMatch(r.pattern,variant,values);
    if(captures){hits.push({rule:r,captures,matchedText:variant,specificity:r.pattern.replace(/\{[^}]+\}/g,'').length});break;}
  }
  if(!hits.length)return null;
  hits.sort((a,b)=>b.specificity-a.specificity||a.rule.rule_id.localeCompare(b.rule.rule_id));
  const same=hits.filter(h=>h.specificity===hits[0].specificity);
  if(same.some(h=>h.rule.patch_type!==hits[0].rule.patch_type||h.rule.command_id!==hits[0].rule.command_id))return{error:'Conflicting follow-up patch rules matched.',code:'AMBIGUOUS_COMMAND'};
  return hits[0];
}
const PLAN_KEYS=['action','commandId','semanticIntent','group','groupId','entity','entityId','groups','entities','comparisonIds','dimension','metric','direction','topN','driver','period','excludedDrivers','excludedEntities','excludedEntityIds','excludedGroups','excludedGroupIds','condition','checkMode','concise','candidateEntities','candidateEntityIds','candidateGroups','candidateGroupIds','anchorMonth','peer','responseVariant','negatedCheck'];
export function planOnly(state){return Object.fromEntries(PLAN_KEYS.filter(k=>state[k]!==undefined).map(k=>[k,clone(state[k])]));}
export function blankPlan(anchor,settings){return {action:null,commandId:null,semanticIntent:null,group:null,groupId:null,entity:null,entityId:null,groups:[],entities:[],comparisonIds:[],dimension:null,metric:'CHANGE',direction:'AUTO',topN:settings.default_top_n,driver:null,period:{mode:'month',month:anchor},excludedDrivers:[],excludedEntities:[],excludedEntityIds:[],excludedGroups:[],excludedGroupIds:[],condition:null,checkMode:'CONTRIBUTES',concise:false,candidateEntities:[],candidateEntityIds:[],candidateGroups:[],candidateGroupIds:[],anchorMonth:anchor,peer:false};}
export function currentSubject(plan,identities){return identities.find(i=>plan.entityId?i.kind==='ENTITY'&&i.id===plan.entityId&&i.parentId===plan.groupId:plan.entity?i.kind==='ENTITY'&&i.name===plan.entity&&i.parentName===plan.group:i.kind==='GROUP'&&(plan.groupId?i.id===plan.groupId:i.name===plan.group))||null;}
export function setSubject(plan,item){
  plan.group=item.kind==='GROUP'?item.name:item.parentName;plan.groupId=item.kind==='GROUP'?item.id:item.parentId;
  plan.entity=item.kind==='ENTITY'?item.name:null;plan.entityId=item.kind==='ENTITY'?item.id:null;
  plan.groups=[];plan.entities=[];plan.comparisonIds=[];
  return plan;
}
function reference(state,index){
  const refs=state.references||[];
  const n=index==='next'?(state.focusRankIndex??0)+1:index==='focus'?(state.focusRankIndex??0):index;
  if(!refs.length||!Number.isInteger(n)||n<0||!refs[n])throw new Error('There is no matching reference in the last successful result. Request a ranking first.');
  return {item:refs[n],index:n};
}
function candidatesFromReferences(plan,state){
  if(!state.references?.length)throw new Error('There is no previous displayed result set to filter or rerank.');
  if(state.rankDimension==='GROUP'){plan.candidateGroups=state.references.map(x=>x.name);plan.candidateGroupIds=state.references.map(x=>x.id);plan.action='TOP_CLIENTS';plan.group=null;plan.groupId=null;plan.entity=null;plan.entityId=null;plan.dimension='GROUP';}
  else if(state.rankDimension==='ENTITY'){plan.candidateEntities=state.references.map(x=>x.name);plan.candidateEntityIds=state.references.map(x=>x.id);plan.action='TOP_ENTITY';plan.entity=null;plan.entityId=null;plan.dimension='ENTITY';}
  else throw new Error('Only group/entity result references can be reranked.');
}
function setComparison(plan,first,second){
  if(!first||!second||first.key===second.key)throw new Error('Specify two distinct comparison subjects.');
  if(first.kind!==second.kind)throw new Error('Compare two groups or two entities; mixed levels are not supported.');
  if(first.kind==='ENTITY'&&first.parentId!==second.parentId)throw new Error('Cross-group entity comparison is not supported by the existing executor.');
  setSubject(plan,first);plan.action='COMPARE';plan.driver=null;plan.dimension=null;plan.condition=null;
  plan.comparisonIds=[first.id,second.id];
  if(first.kind==='GROUP'){plan.groups=[first.name,second.name];plan.entities=[];}
  else{plan.entities=[first.name,second.name];plan.entity=null;plan.entityId=null;}
  plan.candidateEntities=[];plan.candidateEntityIds=[];plan.candidateGroups=[];plan.candidateGroupIds=[];
}
const PATCH_HANDLERS={
  REPLACE_SCOPE(p,e){
    const item=e.c.scope?.value;if(!item)throw new Error('A named group/entity is required.');
    if(p.action==='COMPARE')throw new Error('Specify which comparison subject to replace, or submit a new comparison.');
    if(p.action==='TOP_CLIENTS')throw new Error('Choose an explicit group report after a portfolio ranking, or compare ranked groups.');
    const old=p.groupId;setSubject(p,item);
    if(old!==p.groupId){
      p.candidateEntities=[];p.candidateEntityIds=[];p.candidateGroups=[];p.candidateGroupIds=[];
      if(e.settings['inherit.filter']==='reset')p.condition=null;
      if(p.excludedEntities.length)e.notes.push('Entity exclusions were cleared when changing group.');p.excludedEntities=[];p.excludedEntityIds=[];
      if(e.settings['inherit.excluded_drivers']==='reset')p.excludedDrivers=[];
      if(e.settings['inherit.direction']==='reevaluate'&&p.action!=='MOVEMENT_CHECK')p.direction='AUTO';
    }
    if(['GROUP_ROOT_CAUSE','ENTITY_DRIVER','ENTITY_CONTRIBUTION'].includes(p.action))p.action=item.kind==='ENTITY'?'ENTITY_DRIVER':'GROUP_ROOT_CAUSE';
  },
  REPLACE_PERIOD(p,e){p.period=clone(e.c.period.value);p.candidateEntities=[];p.candidateEntityIds=[];p.candidateGroups=[];p.candidateGroupIds=[];},
  SET_DRIVER(p,e){p.driver=e.c.driver.value;p.action='DRIVER_CONTRIBUTION';p.dimension=null;},
  EXCLUDE(){}, INCLUDE(){}, CLEAR_EXCLUSIONS(p){p.excludedDrivers=[];p.excludedEntities=[];p.excludedEntityIds=[];p.excludedGroups=[];p.excludedGroupIds=[];},
  ADD_FILTER(p,e){if(!['TOP_CLIENTS','TOP_ENTITY'].includes(p.action))throw new Error('A threshold follow-up requires a previous ranking.');candidatesFromReferences(p,e.state);p.condition=clone(e.c.threshold.value);},
  COMPARE_SCOPE(p,e){setComparison(p,currentSubject(e.state,e.identities),e.c.scope.value);},
  COMPARE_REFERENCE(p,e){const ref=reference(e.state,e.c.rankref.value);setComparison(p,ref.item,e.c.scope?.value);},
  COMPARE_PREVIOUS_PERIOD(p,e){const base=e.state.period?.month;if(!base)throw new Error('Select one month before comparing it with the previous month.');p.action='COMPARE';p.period={mode:'comparison',months:[base,shiftMonth(base,-1)]};p.groups=[];p.entities=[];p.comparisonIds=[];p.driver=null;p.dimension=null;p.condition=null;},
  COMPARE_TWO(p,e){const pair=e.state.comparisonSubjects;if(!pair||pair.length!==2)throw new Error('Name two comparison subjects; there is no unambiguous pair.');setComparison(p,pair[0],pair[1]);},
  FOCUS_REFERENCE(p,e){const r=reference(e.state,e.c.rankref.value);setSubject(p,r.item);p.action=r.item.kind==='GROUP'?'GROUP_ROOT_CAUSE':'ENTITY_DRIVER';p.dimension=null;p.driver=null;p.condition=null;p._focusIndex=r.index;},
  NEXT_REFERENCE(p,e){const r=reference(e.state,'next');setSubject(p,r.item);p.action=r.item.kind==='GROUP'?'GROUP_ROOT_CAUSE':'ENTITY_DRIVER';p.dimension=null;p.driver=null;p.condition=null;p._focusIndex=r.index;},
  TOP_REFERENCE(p,e){
    if(e.state.entity){p.action='ENTITY_DRIVER';return;}
    const r=reference(e.state,0);setSubject(p,r.item);p.action=r.item.kind==='GROUP'?'GROUP_ROOT_CAUSE':'ENTITY_DRIVER';p.dimension=null;p.driver=null;p.condition=null;p._focusIndex=r.index;
  },
  RERANK_SET(p,e){candidatesFromReferences(p,e.state);p.driver=e.c.driver?.value||null;p.metric='CHANGE';},
  SET_METRIC(p,e){candidatesFromReferences(p,e.state);p.metric=e.c.metric?.value||'PERCENT';p.driver=null;p.direction='UP';},
  SET_LIMIT(p,e){p.topN=e.c.n.value;if(!['TOP_CLIENTS','TOP_ENTITY'].includes(p.action))throw new Error('Top N applies to a ranking.');},
  SET_STYLE(p,e){p.concise=!/detail/.test(e.text);},
  GROUP_LEVEL(p){p.entity=null;p.entityId=null;p.entities=[];if(['ENTITY_DRIVER','ENTITY_CONTRIBUTION'].includes(p.action))p.action='GROUP_ROOT_CAUSE';},
  CHANGE_COMMAND(p,e){
    const command=e.registry.commands.find(c=>c.command_id===e.patch.rule.command_id);p.action=command.action;
    if(p.action==='TOP_ENTITY'){p.entity=null;p.entityId=null;p.dimension='ENTITY';p.driver=null;}
    if(!['TOP_ENTITY','TOP_CLIENTS'].includes(p.action))p.condition=null;
  },
  REPEAT(){}
};
export function projectContext({patch,state,context,slots,relations,identities,registry,anchor,text}){
  const notes=[];let p=blankPlan(anchor,registry.settings);
  if(patch){
    if(patch.error)return patch;
    if(!state.action)return{error:'This follow-up needs a successfully executed report first. Pending previews and failed requests are not context.',code:'MISSING_CONTEXT'};
    Object.assign(p,planOnly(state));
    const handler=PATCH_HANDLERS[patch.rule.patch_type];
    try{if(!handler)throw new Error('Unsupported context patch.');handler(p,{patch,state,c:patch.captures,settings:registry.settings,registry,identities,text,notes});}
    catch(e){return{error:e.message,code:'AMBIGUOUS_CONTEXT'};}
    // Explicit replacements override inherited parameters; do not copy result amounts.
    if(slots.period&&!['COMPARE_PREVIOUS_PERIOD','REPLACE_PERIOD'].includes(patch.rule.patch_type))p.period=clone(slots.period);
  }else{
    const groupInput=context.selectedClientGroupId||context.selectedClientGroup||context.clientGroup;
    const groupMatches=identities.filter(i=>i.kind==='GROUP'&&i.id===groupInput);
    if(!groupMatches.length&&groupInput)groupMatches.push(...identities.filter(i=>i.kind==='GROUP'&&i.name===groupInput));
    if(groupMatches.length>1)return {code:'AMBIGUOUS_ENTITY',error:'The selected group name is not unique. Select its group ID.'};
    if(groupMatches[0])setSubject(p,groupMatches[0]);
    const entityInput=context.selectedEntityId||context.selectedEntity;
    let em=identities.filter(i=>i.kind==='ENTITY'&&i.id===entityInput&&(!p.groupId||i.parentId===p.groupId));
    if(!em.length&&entityInput)em=identities.filter(i=>i.kind==='ENTITY'&&i.name===entityInput&&(!p.groupId||i.parentId===p.groupId));
    if(em.length>1)return {code:'AMBIGUOUS_ENTITY',error:'The selected client name is not unique. Select its LEID.'};
    if(em[0])setSubject(p,em[0]);
    const legal=relations.subjects.filter(x=>x.kind==='ENTITY'),groups=relations.subjects.filter(x=>x.kind==='GROUP');
    if(legal.length===1)setSubject(p,legal[0]);else if(groups.length===1)setSubject(p,groups[0]);
    if(legal.length===2||groups.length===2){
      try{setComparison(p,...(legal.length===2?legal:groups));}catch(e){return{error:e.message,code:'AMBIGUOUS_ENTITY'};}
    }
    if(slots.period)p.period=clone(slots.period);
    p.metric=slots.metric;p.direction=slots.direction;p.concise=slots.concise;
    p.driver=relations.driver;p.dimension=slots.dimension;
    if(slots.topN)p.topN=slots.topN;
    if(slots.threshold)p.condition=clone(slots.threshold);
    p.checkMode=relations.checkMode;p.negatedCheck=relations.negatedCheck;
  }
  if(patch&&slots.concise)p.concise=true;
  if(patch&&slots.threshold)p.condition=clone(slots.threshold);
  if(patch&&slots.topN)p.topN=slots.topN;
  for(const name of relations.excludedDrivers)p.excludedDrivers=uniq([...p.excludedDrivers,name]);
  for(const name of relations.includedDrivers)p.excludedDrivers=p.excludedDrivers.filter(x=>x!==name);
  for(const s of relations.excluded){
    if(s.kind==='GROUP'){p.excludedGroups=uniq([...p.excludedGroups,s.name]);p.excludedGroupIds=uniq([...p.excludedGroupIds,s.id]);}
    else{p.excludedEntities=uniq([...p.excludedEntities,s.name]);p.excludedEntityIds=uniq([...p.excludedEntityIds,s.id]);if(p.entityId===s.id){p.entity=null;p.entityId=null;}}
  }
  for(const s of relations.included){
    if(s.kind==='GROUP'){p.excludedGroups=p.excludedGroups.filter(x=>x!==s.name);p.excludedGroupIds=p.excludedGroupIds.filter(x=>x!==s.id);}
    else{p.excludedEntities=p.excludedEntities.filter(x=>x!==s.name);p.excludedEntityIds=p.excludedEntityIds.filter(x=>x!==s.id);}
  }
  p.anchorMonth=p.period.month||p.period.end||p.period.months?.[0]||anchor;
  return{plan:p,notes,patch:patch?{ruleId:patch.rule.rule_id,type:patch.rule.patch_type,targetSlot:patch.rule.target_slot,captures:Object.fromEntries(Object.entries(patch.captures).map(([k,v])=>[k,v.value])),notes}:null};
}
/** Successful execution only. Store IDs/labels and ranks, never RWA/driver amounts. */
export function commitState(previous,plan,output,identities){
  const state=planOnly(plan),ranked=output.result?.items||output.result?.entityRanking?.items;
  const basisSame=(previous.groupId===plan.groupId||Number.isInteger(plan._focusIndex))&&JSON.stringify(previous.period)===JSON.stringify(plan.period)&&JSON.stringify(previous.excludedDrivers||[])===JSON.stringify(plan.excludedDrivers||[])&&JSON.stringify(previous.excludedEntityIds||[])===JSON.stringify(plan.excludedEntityIds||[])&&JSON.stringify(previous.excludedGroupIds||[])===JSON.stringify(plan.excludedGroupIds||[]);
  const dimension=output.result?.dimension||'ENTITY';
  if(ranked){
    state.references=ranked.map(x=>identities.find(i=>dimension==='GROUP'?i.kind==='GROUP'&&(x.groupId?i.id===x.groupId:i.name===x.name):i.kind==='ENTITY'&&(x.entityId?i.id===x.entityId&&i.parentId===x.groupId:i.name===(x.entity||x.name)&&i.parentName===x.clientGroup))).filter(Boolean).map(i=>({key:i.key,kind:i.kind,id:i.id,name:i.name,parentId:i.parentId,parentName:i.parentName}));
    state.rankDimension=dimension;state.focusRankIndex=0;
  }else if(basisSame){state.references=clone(previous.references||[]);state.rankDimension=previous.rankDimension;state.focusRankIndex=plan._focusIndex??previous.focusRankIndex??0;}
  else{state.references=[];state.rankDimension=null;state.focusRankIndex=0;}
  const old=currentSubject(previous,identities),now=currentSubject(plan,identities);
  state.comparisonSubjects=plan.comparisonIds?.length===2?plan.comparisonIds.map(id=>identities.find(i=>plan.groups?.length===2?i.kind==='GROUP'&&i.id===id:i.kind==='ENTITY'&&i.id===id&&i.parentId===plan.groupId)).filter(Boolean).map(i=>({key:i.key,kind:i.kind,id:i.id,name:i.name,parentId:i.parentId,parentName:i.parentName})):basisSame?clone(previous.comparisonSubjects||[]):[];
  if(old&&now&&old.key!==now.key&&old.kind===now.kind)state.comparisonSubjects=[old,now].map(i=>({key:i.key,kind:i.kind,id:i.id,name:i.name,parentId:i.parentId,parentName:i.parentName}));
  return state;
}
