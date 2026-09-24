import {RuleClient} from './rule_client.js';
import {createProvider} from './tableau_adapter.js';
import {validateCatalog} from './group_catalog.js';
import {catalogMentions,portfolioRequest,findNames,norm} from './rule_parser.js';
import {localText} from './network.js';
export async function main(config){
 const $=id=>document.getElementById(id),client=new RuleClient(config);
 let groups=[],entityCatalog=[],provider,lastGroup=null,pending=null,metadata={rows:[]},busy=true,ready=false;
 const controls=()=>{for(const e of document.querySelectorAll('#ask,#question,#newchat,#group,#entity,#month,[data-question],.choices button'))e.disabled=busy||!ready;};
 const options=(id,items)=>$(id).replaceChildren(...items.map(([name,value])=>new Option(name,value)));
 function groupChanged(){const rr=metadata.rows.filter(r=>!$('group').value||r.client_group_id===$('group').value);options('entity',[['From conversation',''],...[...new Set(rr.map(r=>r.entity))].map(e=>[e,e])]);options('month',[['From question / latest',''],...[...new Set(rr.map(r=>r.month))].sort().reverse().map(m=>[m,m])]);}
 function context(c={}){$('context').textContent=[c.clientGroup,c.entity,c.month,c.excludedDrivers?.length?'Excluding '+c.excludedDrivers.join(', '):''].filter(Boolean).join(' · ')||'No client selected · Name a client in your question';}
 function message(role,text){$('welcome').hidden=true;const a=document.createElement('article');a.className=role;const label=document.createElement('div');label.className='role';label.textContent=role==='user'?'You':'RWA Analytics';const b=document.createElement('div');b.className='message';b.textContent=text;a.append(label,b);$('history').append(a);return a;}
 function results(a,r){
  a.querySelector('.message').textContent=r.answer;
  if(r.table&&r.table.rows.length){const t=document.createElement('table');t.className='message-table';const head=document.createElement('tr');for(const v of r.table.columns){const th=document.createElement('th');th.textContent=v;head.append(th);}t.append(head);for(const values of r.table.rows){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}t.append(tr);}a.append(t);}
  if(r.choices?.length){const div=document.createElement('div');div.className='choices';for(const choice of r.choices){const b=document.createElement('button');b.type='button';b.textContent=choice;b.onclick=()=>{$('question').value=choice;send();};div.append(b);}a.append(div);}
  const d=document.createElement('details'),s=document.createElement('summary'),pre=document.createElement('pre');s.textContent=r.ok?'Executed command & calculation evidence':r.status==='preview'?'Fixed command details':'Why no calculation ran';pre.className='debug';pre.textContent=JSON.stringify(r,null,2);d.append(s,pre);a.append(d);
 }
 function reset({history=false}={}){client.reset();lastGroup=null;pending=null;if(history){$('history').replaceChildren();$('welcome').hidden=false;}context({clientGroup:groups.find(g=>g.client_group_id===$('group').value)?.client_group_name,entity:$('entity').value,month:$('month').value});}
 function accepted(r){
  if(!r.ok)return;pending=null;lastGroup=groups.find(g=>g.client_group_name===r.clientGroup)||null;
  const oldEntity=$('entity').value,oldMonth=$('month').value;$('group').value=lastGroup?.client_group_id||'';groupChanged();
  if([...$('entity').options].some(o=>o.value===oldEntity))$('entity').value=oldEntity;
  if([...$('month').options].some(o=>o.value===oldMonth))$('month').value=oldMonth;
  context(r.conversationContext);
 }
 function preview(a,r){
  results(a,r);if(r.status!=='preview')return;
  const fields=document.createElement('div');fields.className='plan-preview';
  const p=r.plan,period=p.period.mode==='month'?p.period.month:p.period.mode==='comparison'?p.period.months.join(' versus '):p.period.mode==='window'?p.period.start+' to '+p.period.end:'Available history through '+p.period.end;
  const labels={TOP_ENTITY:'Rank contributors',TOP_CLIENTS:'Rank client groups',GROUP_ROOT_CAUSE:'RWA movement breakdown',ENTITY_DRIVER:'Entity driver breakdown',MAIN_DRIVER:'Largest attributed driver',DRIVER_CONTRIBUTION:'Driver contribution',DRIVER_CHECK:'Check reported driver',ENTITY_CONTRIBUTION:'Entity contribution',CONCENTRATION:'Entity concentration share',DATA_QUALITY:'Attribution reconciliation',OFFSETS:'Offsetting contributions',COMPARE:'Comparison',TREND:'Monthly movement report',PEAK_MONTH:'Largest month / balance'};
  const fieldsToShow={Report:labels[p.action]||p.action,Group:p.groups?.length?p.groups.join(' versus '):p.group||'Loaded portfolio',Entity:p.entities?.length?p.entities.join(' versus '):p.entity||'All in group',Period:period};
  if(p.dimension)fieldsToShow['Breakdown']=p.dimension.toLowerCase();
  if(['TOP_ENTITY','TOP_CLIENTS'].includes(p.action))fieldsToShow['Limit']='Top '+p.topN;
  fieldsToShow['Metric']=p.metric==='PERCENT'?'Percentage change':p.metric==='BALANCE'?'Closing RWA balance':'RWA movement';
  if(p.direction!=='AUTO')fieldsToShow['Direction']=p.direction;
  fieldsToShow['Driver']=p.driver||'All reported drivers';
  fieldsToShow['Exclusions']=[...p.excludedDrivers,...p.excludedEntities].join(', ')||'None';
  if(p.condition)fieldsToShow['Threshold']=p.condition.metric+' '+p.condition.op+' '+p.condition.value+(p.condition.metric==='PERCENT'?'%':' USDm');
  if(p.action==='DRIVER_CHECK')fieldsToShow['Check']=p.checkMode;
  if(p.concise)fieldsToShow['Format']='Short';
  for(const [label,value] of Object.entries(fieldsToShow)){
   const row=document.createElement('div');row.textContent=label+': '+value;fields.append(row);
  }
  const run=document.createElement('button'),cancel=document.createElement('button');run.textContent='Run report';cancel.textContent='Cancel';run.type=cancel.type='button';run.className='confirm-report';cancel.className='cancel-report';
  run.onclick=()=>{if(busy)return;run.disabled=cancel.disabled=true;try{const out=client.confirm(r.previewToken);a.replaceChildren(a.firstChild,a.querySelector('.message'));results(a,out);accepted(out);}catch(e){a.querySelector('.message').textContent='No report produced: '+e.message;}};
  cancel.onclick=()=>{client.cancel();run.disabled=cancel.disabled=true;a.querySelector('.message').textContent='Cancelled. No report calculation ran.';};
  fields.append(run,cancel);a.insertBefore(fields,a.querySelector('details'));
 }
 async function send(){
  const q=$('question').value.trim();if(!q||busy||!ready)return;
  busy=true;controls();$('question').value='';message('user',q);const a=message('assistant','Reading authorised data…');
  try{
   const mentions=catalogMentions(q,groups);let ids=[...new Set(mentions.map(x=>x.key))];
   if(!ids.length&&entityCatalog.length){const em=findNames(norm(q),entityCatalog.map(e=>({key:e.entity_id,groupId:e.client_group_id,aliases:[e.entity,e.entity_id,...(e.aliases||[])]})));ids=[...new Set(em.map(e=>e.groupId))];}
   if(ids.length>2)throw new Error('Use one group, two groups for comparison, or “Top groups”.');
   const selected=groups.find(g=>g.client_group_id===$('group').value);
   let chosen=ids.map(id=>groups.find(g=>g.client_group_id===id));
   const wantedPortfolio=portfolioRequest(q);
   if(!chosen.length&&(selected||lastGroup))chosen=[selected||lastGroup];
   if(!wantedPortfolio&&!chosen.length){pending=q;results(a,{ok:false,status:'clarify',answer:'Which client group should I analyse? Enter its full name or ID.'});return;}
   const bare=chosen.length===1&&[chosen[0].client_group_id,chosen[0].client_group_name,...chosen[0].aliases].some(x=>norm(x)===norm(q));
   const question=pending&&bare?pending+' for '+chosen[0].client_group_name:q;
   client.invalidate(); // Never answer on old data after a failed refresh.
   let rows=[];if(wantedPortfolio)rows=await provider.loadPortfolio();else for(const g of chosen)rows.push(await provider.load(g)); // Same Tableau worksheet: filter/read sequentially.
   metadata=client.setData(rows,{portfolioComplete:wantedPortfolio,source:config.mode==='sample'?'synthetic sample CSV':'authenticated Tableau summary data'});
   const ctx={};if(chosen[0])ctx.selectedClientGroup=chosen[0].client_group_name;
   if($('entity').value&&(!lastGroup||chosen[0]?.client_group_id===lastGroup.client_group_id))ctx.selectedEntity=$('entity').value;
   if($('month').value)ctx.selectedMonth=$('month').value;
   const r=client.prepare(question,ctx);preview(a,r);

  }catch(e){client.invalidate();a.querySelector('.message').textContent='No answer produced: '+e.message;}finally{busy=false;controls();$('question').focus();a.scrollIntoView({block:'center',behavior:'smooth'});}
 }
 $('form').onsubmit=e=>{e.preventDefault();send();};$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
 for(const b of document.querySelectorAll('[data-question]'))b.onclick=()=>{$('question').value=b.dataset.question;send();};
 $('newchat').onclick=()=>{$('group').value='';groupChanged();reset({history:true});};
 $('group').onchange=()=>{groupChanged();reset();};$('entity').onchange=()=>reset();$('month').onchange=()=>reset();
 try{
  const catalogData=JSON.parse(await localText(config.catalogUrl));groups=validateCatalog(catalogData);entityCatalog=catalogData.entities||[];if(!Array.isArray(entityCatalog)||entityCatalog.some(e=>typeof e.entity!=='string'||typeof e.entity_id!=='string'||typeof e.client_group_id!=='string'||!Array.isArray(e.aliases)))throw new Error('Invalid optional entity catalog.');
  config.rules=config.rules||{};config.rules.entityAliases=config.rules.entityAliases||{};for(const e of entityCatalog)config.rules.entityAliases[e.entity]=[...new Set([...(config.rules.entityAliases[e.entity]||[]),...e.aliases])];
  options('group',[['From conversation',''],...groups.map(g=>[g.client_group_name,g.client_group_id])]);groupChanged();
  $('tableau-panel').hidden=config.mode!=='tableau';if(config.mode==='tableau')$('tableau-panel').open=true;
  provider=await createProvider(config,$('tableau-host'),groups);
  provider.onContextChanged(()=>{if(busy)return;client.invalidate();reset();$('group').value='';$('entity').value='';$('month').value='';context();$('status').textContent='Tableau filters changed. Conversation scope cleared; the next question reloads data.';});
  ready=true;busy=false;$('progress').hidden=true;$('status').textContent=config.mode==='sample'?'Ready · Synthetic data · Fixed commands · Preview required':'Ready · Authenticated Tableau · Fixed commands · Preview required';controls();
  window.addEventListener('pagehide',()=>{client.reset();provider.close();},{once:true});
 }catch(e){$('status').classList.add('error');$('status').textContent='Initialization failed: '+e.message;$('progress').hidden=true;controls();}
}
