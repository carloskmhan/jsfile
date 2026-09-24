import {RuleParser, RULE_VERSION, monthRange, norm} from './rule_parser.js';
const EPS=1e-8, sum=a=>a.reduce((s,x)=>s+x,0), unique=a=>[...new Set(a)], badKey=k=>['__proto__','constructor','prototype'].includes(k);
const clone=x=>JSON.parse(JSON.stringify(x));
export class RwaQaEngine {
 constructor(rows=[],options={}) {
  if(rows===null&&Array.isArray(options)){rows=options;options=arguments[2]||{};} // legacy deterministic call shape only
  if(!Array.isArray(rows))throw new Error('Expected row array; learned classifiers are not supported.');
  this.options={unit:'USDm',reconciliationTolerance:0.01,portfolioComplete:false,...options};
  this.parser=new RuleParser(options);this.setRows(rows);this.reset();
 }
 setRows(rows){
  const seen=new Set();this.rows=rows.map((r,i)=>{
   for(const key of ['client_group','entity','month'])if(typeof r[key]!=='string'||!r[key].trim())throw new Error(`Row ${i+1}: missing ${key}.`);
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month))throw new Error('Month must be YYYY-MM.');
   for(const key of ['rwa_prev','rwa_curr'])if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<0)throw new Error(`Row ${i+1}: ${key} must be a finite nonnegative number.`);
   if(!r.drivers||typeof r.drivers!=='object'||Array.isArray(r.drivers))throw new Error('Driver amounts must be an object (empty if unavailable).');
   const drivers=Object.create(null);for(const [k,v]of Object.entries(r.drivers)){if(badKey(k)||typeof v!=='number'||!Number.isFinite(v))throw new Error('Invalid driver key or nonnumeric amount.');drivers[k]=v;}
   const key=JSON.stringify([r.client_group_id||r.client_group,r.entity_id||r.entity,r.month,r.product||'',r.booking_location||'',r.record_id||'']);
   if(seen.has(key))throw new Error('Duplicate record at the declared grain. Supply distinct product/location/record_id or aggregate upstream.');seen.add(key);
   return {...r,drivers};
  });
  this.groups=unique(this.rows.map(r=>r.client_group)).sort();this.entities=unique(this.rows.map(r=>r.entity)).sort();
 }
 reset(){this.state={};this.lastResult=null;}
 parseQuestion(question,context={}){return this.parser.parse(question,this.rows,context,this.state);}
 amt(x,signed=true){const sign=signed?(x>EPS?'+':x<-EPS?'-':''):(x<0?'-':'');const a=Math.abs(x);if(this.options.unit==='USDm')return sign+'$'+(a>=1000?(a/1000).toFixed(2)+'bn':Number(a.toFixed(2)).toLocaleString('en-US')+'m');return sign+Number(a.toFixed(2)).toLocaleString('en-US')+' '+this.options.unit;}
 pct(x){return x==null||!Number.isFinite(x)?'n/a':(100*x).toFixed(1)+'%';}
 labelPeriod(p){if(p.mode==='month')return p.month;if(p.mode==='window')return `${p.start} to ${p.end}`;if(p.mode==='comparison')return p.months.join(' vs ');return 'available history through '+p.end;}
 baseRows(p){return this.rows.filter(r=>(!p.group||r.client_group===p.group)&&(!p.entity||r.entity===p.entity)&&!p.excludedEntities.includes(r.entity));}
 select(p){const base=this.baseRows(p);let months=p.period.mode==='history'?unique(base.map(r=>r.month)).filter(m=>m<=p.period.end).sort():p.period.mode==='window'?monthRange(p.period.start,p.period.end):[p.period.month];
  if(!months.length)throw new Error('No available history for this scope.');
  const missing=months.filter(m=>!base.some(r=>r.month===m));if(missing.length)throw new Error(`No data for ${missing.join(', ')} in this scope. Missing months were not replaced or treated as zero.`);
  return {rows:base.filter(r=>months.includes(r.month)),months};
 }
 aggregateRows(rows,p){
  if(!rows.length)throw new Error('No matching rows.');const tolerance=this.options.reconciliationTolerance;
  const months=unique(rows.map(r=>r.month)).sort(),monthly=months.map(month=>{const rr=rows.filter(r=>r.month===month);return {month,prev:sum(rr.map(r=>r.rwa_prev)),curr:sum(rr.map(r=>r.rwa_curr)),change:sum(rr.map(r=>r.rwa_curr-r.rwa_prev))};});
  const originalChange=sum(monthly.map(r=>r.change)),drivers=Object.create(null),warnings=[];
  let rowResiduals=0,missingBreakdowns=0;
  for(const r of rows){const values=Object.values(r.drivers);if(!values.length)missingBreakdowns++;if(Math.abs(r.rwa_curr-r.rwa_prev-sum(values))>tolerance)rowResiduals++;for(const[k,v]of Object.entries(r.drivers))drivers[k]=(drivers[k]||0)+v;}
  for(const d of p.excludedDrivers){if(rows.some(r=>!Object.hasOwn(r.drivers,d)))throw new Error(`${d} is missing from some records. An exclusion requires an explicit amount (including zero) for every selected record.`);}
  const driverTotal=sum(Object.values(drivers)),residual=originalChange-driverTotal;
  const change=originalChange-sum(p.excludedDrivers.map(d=>drivers[d]));
  const alignedDirection=Math.abs(change)<EPS?0:Math.sign(change);
  const list=Object.entries(drivers).filter(([d])=>!p.excludedDrivers.includes(d)).map(([name,impact])=>({name,impact})).sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact)||a.name.localeCompare(b.name));
  const aligned=list.filter(d=>Math.sign(d.impact)===alignedDirection&&Math.abs(d.impact)>EPS),offsets=list.filter(d=>alignedDirection&&Math.sign(d.impact)===-alignedDirection);
  const main=aligned[0]||null;
  const continuityIssues=monthly.slice(1).filter((m,i)=>Math.abs(m.prev-monthly[i].curr)>tolerance).map(m=>m.month);
  if(continuityIssues.length)warnings.push('Opening/closing balances are discontinuous at '+continuityIssues.join(', ')+'. Window movement is the sum of reported monthly movements, not an endpoint bridge.');
  const membership=new Map();for(const r of rows){const k=(r.client_group_id||r.client_group)+'/'+(r.entity_id||r.entity);if(!membership.has(k))membership.set(k,new Set());membership.get(k).add(r.month);}
  if(months.length>1&&[...membership.values()].some(s=>s.size<months.length))warnings.push('Entity coverage changes within this window; missing entity-months are not assumed to be zero.');
  if(Math.abs(residual)>tolerance||rowResiduals)warnings.push(`Attribution check: net residual ${this.amt(residual)}; ${rowResiduals} row(s) outside the ${this.amt(tolerance,false)} tolerance. Net residuals can cancel across records.`);
  if(missingBreakdowns)warnings.push(`${missingBreakdowns} row(s) have no reported driver breakdown.`);
  if(p.excludedDrivers.length)warnings.push('Exclusions subtract reported driver attribution only; this is not a constant-factor RWA recalculation.');
  return {rwa_prev:monthly[0].prev,rwa_curr:monthly.at(-1).curr,change,originalChange,pctChange:monthly[0].prev?change/monthly[0].prev:null,driverTotal,residual,reconciled:Math.abs(residual)<=tolerance&&!rowResiduals, rowResiduals,drivers:list,main,aligned,offsets,alignedTotal:sum(aligned.map(x=>Math.abs(x.impact))),monthly,months,warnings,rows:rows.length};
 }
 aggregate(group,entity,month){const p={group,entity,period:{mode:'month',month},excludedDrivers:[],excludedEntities:[]};const a=this.aggregateRows(this.select(p).rows,p);return {...a,drivers:Object.fromEntries(a.drivers.map(d=>[d.name,d.impact]))};}
 ranking(p,dimension='ENTITY'){
  let source=this.baseRows({...p,entity:dimension==='ENTITY'?null:p.entity});
  if(dimension==='ENTITY'&&p.candidateEntities?.length)source=source.filter(r=>p.candidateEntities.includes(r.entity));
  if(dimension==='GROUP')source=this.rows.filter(r=>!p.excludedEntities.includes(r.entity));
  const field={GROUP:'client_group',ENTITY:'entity',PRODUCT:'product',LOCATION:'booking_location'}[dimension];
  if(!field||source.some(r=>!r[field]))throw new Error(`${dimension} detail is not present on every record in this scope. Provide it in json_data.rows first.`);
  const scopeMonths=p.period.mode==='window'?monthRange(p.period.start,p.period.end):p.period.mode==='history'?unique(source.map(r=>r.month)).filter(m=>m<=p.period.end).sort():[p.period.month];
  const map=new Map();for(const r of source){if(!scopeMonths.includes(r.month))continue;const key=dimension==='ENTITY'?(r.client_group_id||r.client_group)+'/'+(r.entity_id||r.entity):r[field];if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
  const targetScopeKeys=new Set(source.map(r=>dimension==='ENTITY'?(r.client_group_id||r.client_group)+'/'+(r.entity_id||r.entity):r[field]));
  let missing=targetScopeKeys.size-map.size;const values=[];
  for(const [key,rr] of map){if(scopeMonths.some(m=>!rr.some(r=>r.month===m))){missing++;continue;}const a=this.aggregateRows(rr,p);const driver=p.driver?a.drivers.find(x=>norm(x.name)===norm(p.driver)):null;
   if(p.driver&&!driver)continue;
   const value=p.driver?driver.impact:p.metric==='BALANCE'?a.rwa_curr:p.metric==='PERCENT'?(a.pctChange==null?null:a.pctChange*100):a.change;
   if(value===null)continue;
   values.push({key,name:rr[0][field],entity:dimension==='ENTITY'?rr[0].entity:null,clientGroup:rr[0].client_group,change:a.change,value,rwa_prev:a.rwa_prev,rwa_curr:a.rwa_curr,pctChange:a.pctChange,mainDriver:a.main,driverImpact:driver?.impact,attributionResidual:a.residual,rowResiduals:a.rowResiduals});
  }
  const all=values.slice();let direction=p.direction;
  if(direction==='AUTO')direction=sum(all.map(x=>x.change))<0?'DOWN':'UP';
  let filtered=values.filter(x=>p.metric==='BALANCE'||direction==='ABSOLUTE'||(direction==='DOWN'?x.value<-EPS:x.value>EPS));
  const gross=sum(all.filter(x=>direction==='DOWN'?x.value<0:x.value>0).map(x=>Math.abs(x.value)));
  const net=sum(all.map(x=>x.change));for(const x of all){x.shareOfAligned=(direction==='DOWN'?x.value<0:x.value>0)&&gross?Math.abs(x.value)/gross:null;x.contributionToNet=Math.abs(net)>EPS?x.change/net:null;}
  if(p.condition){const c=p.condition;filtered=filtered.filter(x=>{const v=c.metric==='PERCENT'?(x.pctChange==null?null:x.pctChange*100):c.metric==='DRIVER'?x.driverImpact:x.change;return v!=null&&({GT:v>c.value,GTE:v>=c.value,LT:v<c.value,LTE:v<=c.value}[c.op]);});}
  filtered.sort((a,b)=>(direction==='ABSOLUTE'?Math.abs(b.value)-Math.abs(a.value):direction==='DOWN'?a.value-b.value:b.value-a.value)||a.name.localeCompare(b.name));
  const top=filtered.slice(0,p.topN);for(let i=0;i<top.length;i++)top[i].rank=i&&Math.abs(top[i].value-top[i-1].value)<EPS?top[i-1].rank:i+1;
  return {dimension,items:top,all,eligible:filtered.length,loaded:targetScopeKeys.size,missing,net,gross,direction,months:scopeMonths,partial:missing>0};
 }
 execute(p){
  if(!p.group&&!['TOP_CLIENTS','COMPARE'].includes(p.action))throw new Error('Select a client group before this report.');
  if(p.period.mode==='comparison'&&(p.entities.length>1||p.groups.length>1))throw new Error('Compare two periods or two subjects, not both in one report.');
  if(p.driver&&p.action==='COMPARE')throw new Error('Driver-filtered comparison is not implemented. Use contribution reports for each subject.');
  if(p.metric==='BALANCE'&&p.excludedDrivers.length)throw new Error('Driver attribution cannot be subtracted from an RWA balance as a substitute for recalculation. Ask for the movement excluding those drivers.');
  const who=p.entity||p.group||'Loaded portfolio',when=this.labelPeriod(p.period),parts=[],warnings=[];let result,table=null;
  const unit=p.metric==='PERCENT'?'%':'USDm';
  const rankText=(r)=>r.items.map(x=>`${x.rank}. ${x.name}: ${p.metric==='PERCENT'?x.value.toFixed(1)+'%':this.amt(x.value)}${p.driver?' attributed to '+p.driver:''}`).join('\n');
  if(p.action==='TOP_CLIENTS'||p.action==='TOP_ENTITY'){
   if(p.action==='TOP_CLIENTS'&&!this.options.portfolioComplete)throw new Error('Portfolio ranking requires a fresh authorised portfolio response. A single-group response cannot be presented as a portfolio ranking.');
   result=this.ranking({...p,group:p.action==='TOP_CLIENTS'?null:p.group,entity:p.action==='TOP_CLIENTS'?null:p.entity},p.action==='TOP_CLIENTS'?'GROUP':p.dimension||'ENTITY');
   parts.push(`Top ${result.items.length} ${result.dimension.toLowerCase()} contributors for ${when}${p.group?' in '+p.group:''}, ranked by ${p.driver?p.driver+' attribution':p.metric==='BALANCE'?'closing RWA balance':p.metric==='PERCENT'?'percentage change':'RWA movement'}:`);
   parts.push(result.items.length?rankText(result):'No contributors satisfy the requested direction and conditions.');
   if(result.partial)warnings.push(`${result.missing} of ${result.loaded} loaded ${result.dimension.toLowerCase()} members lack complete data for the requested period. Ranking covers the available subset only.`);
   if(result.items.some(x=>x.rowResiduals))warnings.push('One or more displayed contributors have unreconciled attribution; movement ranking still uses recorded balances.');
   table={columns:['Rank','Name',p.driver?p.driver+' ('+unit+')':p.metric+' ('+unit+')'],rows:result.items.map(x=>[x.rank,x.name,Number(x.value.toFixed(3))])};
  }else if(p.action==='COMPARE'){
   const panels=[];
   if(p.period.mode==='comparison')for(const month of p.period.months){const pp={...p,period:{mode:'month',month}};panels.push({name:month,...this.aggregateRows(this.select(pp).rows,pp)});}
   else if(p.entities.length===2)for(const entity of p.entities){const pp={...p,entity};panels.push({name:entity,...this.aggregateRows(this.select(pp).rows,pp)});}
   else if(p.groups.length===2)for(const group of p.groups){const pp={...p,group,entity:null};panels.push({name:group,...this.aggregateRows(this.select(pp).rows,pp)});}
   else {
    if(!this.options.portfolioComplete)throw new Error('Peer comparison requires a fresh authorised portfolio response, not a single loaded group.');
    const ranked=this.ranking({...p,group:null,entity:null,direction:'ABSOLUTE',topN:50,condition:null,metric:'CHANGE',driver:null},'GROUP');
    const target=ranked.all.find(x=>x.name===p.group),peers=ranked.all.filter(x=>x.name!==p.group);
    if(!target||!peers.length)throw new Error('No target or peer group with complete data in the requested period.');
    const sorted=peers.map(x=>x.change).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    const rank=1+ranked.all.filter(x=>x.change>target.change+EPS).length;
    result={target,rank,median,peerCount:peers.length,population:ranked.all.length,missing:ranked.missing};
    parts.push(`${p.group}'s RWA movement was ${this.amt(target.change)} for ${when}, ranked ${rank} of ${ranked.all.length} groups by signed increase. The other ${peers.length} loaded groups had a median movement of ${this.amt(median)}.`);
    warnings.push('These are available groups, not a size- or risk-matched peer set. No statistical outlier claim is made.');if(ranked.missing)warnings.push(`${ranked.missing} groups lack complete period data and are excluded.`);
   }
   if(panels.length){result={panels,changeDifference:panels[0].change-panels[1].change,balanceDifference:panels[0].rwa_curr-panels[1].rwa_curr};parts.push(panels.map(a=>`${a.name}: RWA movement ${this.amt(a.change)}; closing balance ${this.amt(a.rwa_curr,false)}${a.main?`; main attributed driver ${a.main.name} ${this.amt(a.main.impact)}`:''}.`).join(' '));parts.push(`First minus second: ${this.amt(result.changeDifference)} in movement; ${this.amt(result.balanceDifference)} in closing balance.`);warnings.push(...panels.flatMap(x=>x.warnings));}
  }else if(p.action==='PEAK_MONTH'||p.action==='TREND'){
   const selected=this.select(p),points=selected.months.map(month=>({month,...this.aggregateRows(selected.rows.filter(r=>r.month===month),{...p,period:{mode:'month',month}})}));
   if(p.action==='PEAK_MONTH'){
    const down=p.direction==='DOWN';const ranked=points.slice().sort((a,b)=>p.metric==='BALANCE'?(down?a.rwa_curr-b.rwa_curr:b.rwa_curr-a.rwa_curr):p.metric==='PERCENT'?(down?(a.pctChange??Infinity)-(b.pctChange??Infinity):(b.pctChange??-Infinity)-(a.pctChange??-Infinity)):(down?a.change-b.change:b.change-a.change));
    const best=ranked[0];result={month:best.month,change:best.change,rwa_curr:best.rwa_curr,metric:p.metric,points};
    if(p.metric==='CHANGE'&&(down?best.change>=0:best.change<=0))parts.push(`No monthly ${down?'decrease':'increase'} was recorded for ${who} in ${when}.`);
    else parts.push(`${who}'s ${p.metric==='BALANCE'?(down?'lowest':'highest')+' RWA balance':p.metric==='PERCENT'?'largest percentage '+(down?'decrease':'increase'):'largest monthly '+(down?'decrease':'increase')} was in ${best.month}: ${p.metric==='BALANCE'?this.amt(best.rwa_curr,false):p.metric==='PERCENT'?this.pct(best.pctChange):this.amt(best.change)}.`);
   }else{const a=this.aggregateRows(selected.rows,p);result={...a,points};parts.push(`${who}: total reported RWA movement ${this.amt(a.change)} across ${points.length} months (${when}); ${points.filter(x=>x.change>EPS).length} up, ${points.filter(x=>x.change<-EPS).length} down and ${points.filter(x=>Math.abs(x.change)<=EPS).length} flat.`);table={columns:['Month','RWA change (USDm)','Closing balance (USDm)'],rows:points.map(x=>[x.month,x.change,x.rwa_curr])};warnings.push(...a.warnings);}
  }else{
   const selected=this.select(p),a=this.aggregateRows(selected.rows,p);result=a;warnings.push(...a.warnings);
   const start=()=>`${who}'s RWA ${Math.abs(a.change)<EPS?'was unchanged':a.change>0?'increased':'decreased'}${Math.abs(a.change)<EPS?'':' by '+this.amt(Math.abs(a.change),false)} in ${when}${a.pctChange===null?' (percentage change unavailable: zero opening balance)':Math.abs(a.change)<EPS?'':' ('+this.pct(Math.abs(a.pctChange))+')'}.`;
   const main=()=>a.main?`The largest attributed driver in the direction of the net movement was ${a.main.name} at ${this.amt(a.main.impact)}.`:Math.abs(a.change)<EPS?'There is no dominant direction because the net movement is zero.':'No reported driver explains the direction of the net movement.';
   if(p.action==='DATA_QUALITY')parts.push(`${a.reconciled?'Yes':'No'}. Reported drivers total ${this.amt(a.driverTotal)}, versus the original RWA movement of ${this.amt(a.originalChange)}; residual ${this.amt(a.residual)}. ${a.rowResiduals} row(s) fail reconciliation.`);
   else if(p.action==='MAIN_DRIVER')parts.push(main());
   else if(p.action==='DRIVER_CONTRIBUTION'||p.action==='DRIVER_CHECK'){
    const d=a.drivers.find(d=>norm(d.name)===norm(p.driver));if(!d)throw new Error(`No reported ${p.driver} amount is available.`);
    if(p.action==='DRIVER_CONTRIBUTION')parts.push(`${p.driver} contributed ${this.amt(d.impact)} to ${who}'s movement in ${when}${Math.abs(a.change)>EPS?', equivalent to '+this.pct(d.impact/a.change)+' of the net movement (may exceed 100% when offset)':''}.`);
    else{const aligns=Math.abs(a.change)>EPS&&Math.sign(d.impact)===Math.sign(a.change),isMain=aligns&&a.main&&Math.abs(d.impact)>=Math.abs(a.main.impact)-EPS;
     const yes=p.checkMode==='SOLE'?aligns&&a.reconciled&&a.drivers.every(x=>x.name===d.name||Math.abs(x.impact)<=EPS):p.checkMode==='MAIN'?isMain:aligns;
     parts.push(`${yes?'Yes':'No'}. ${d.name} ${yes?(p.checkMode==='SOLE'?'was the sole reported driver':p.checkMode==='MAIN'?'was a largest same-direction driver':'contributed in the direction of the net movement'):(p.checkMode==='MAIN'?'was not the largest same-direction driver':p.checkMode==='SOLE'?'was not the sole reconciled driver':'did not contribute in the direction of the net movement')} (${this.amt(d.impact)}). ${main()}`);
    }
    result={...a,checkedDriver:d};
   }else if(p.action==='ENTITY_CONTRIBUTION'){
    const pp={...p,entity:null};const g=this.aggregateRows(this.select(pp).rows,pp);result={...a,groupChange:g.change,contributionToNet:Math.abs(g.change)>EPS?a.change/g.change:null};parts.push(`${p.entity} contributed ${this.amt(a.change)} to ${p.group}'s ${this.amt(g.change)} movement in ${when}${result.contributionToNet==null?'':', or '+this.pct(result.contributionToNet)+' of the net group movement (not a concentration measure)'}.`);
   }else if(p.action==='CONCENTRATION'){
    const r=this.ranking({...p,entity:null,metric:'CHANGE',driver:null,direction:'AUTO',topN:50,condition:null},'ENTITY');
    if(Math.abs(r.net)<EPS||!r.items.length){parts.push('The net movement is zero; there is no single direction for a concentration classification. Review positive and negative contributors separately.');result={...r,label:null};}
    else {const top=r.items[0],share=top.shareOfAligned;result={...r,label:null,share};parts.push(`${top.name} represented ${this.pct(share)} of gross same-direction entity movements (${this.amt(top.change)}). This is a descriptive share, not a credit-risk judgement or regulatory concentration classification.`);}

   }else if(p.action==='OFFSETS'){
    parts.push(Math.abs(a.change)<EPS?`The net movement is zero. Positive drivers total ${this.amt(sum(a.drivers.filter(d=>d.impact>0).map(d=>d.impact)))}; negative drivers total ${this.amt(sum(a.drivers.filter(d=>d.impact<0).map(d=>d.impact)))}.`:a.offsets.length?`Offsets to the ${a.change>0?'increase':'decrease'} were ${a.offsets.map(d=>d.name+' '+this.amt(d.impact)).join(', ')}.`:'No reported driver offsets the net movement.');
   }else{
    parts.push(start());
    if(!p.entity){const r=this.ranking({...p,metric:'CHANGE',direction:'AUTO',driver:null,topN:3,condition:null},'ENTITY');if(Math.abs(a.change)>EPS&&r.items[0]){const e=r.items[0];parts.push(`${e.name} was the largest same-direction entity contributor at ${this.amt(e.change)} (${this.pct(e.shareOfAligned)} of gross same-direction entity movement).`);if(e.mainDriver)parts.push(`Within ${e.name}, the main attributed driver was ${e.mainDriver.name} at ${this.amt(e.mainDriver.impact)}.`);}if(r.missing)warnings.push(`${r.missing} entities have incomplete period coverage.`);result={...a,entityRanking:r};}
    parts.push(main());
    if(a.aligned.length>1)parts.push('Other same-direction drivers: '+a.aligned.slice(1,3).map(d=>d.name+' '+this.amt(d.impact)).join(', ')+'.');
    if(a.offsets.length)parts.push('Offsets: '+a.offsets.slice(0,3).map(d=>d.name+' '+this.amt(d.impact)).join(', ')+'.');
   }
  }
  if(p.excludedDrivers.length)parts.unshift('Basis: excluding reported '+p.excludedDrivers.join(', ')+' attribution.');
  if(p.excludedEntities.length)parts.unshift('Entities excluded: '+p.excludedEntities.join(', ')+'.');
  if(p.candidateEntities?.length)parts.unshift('Basis: limited to the prior displayed entity set.');
  const notes=unique(warnings);
  const narrative=p.concise?parts.filter(Boolean).slice(0,p.excludedDrivers.length||p.excludedEntities.length?3:2).join(' '):parts.filter(Boolean).join('\n');
  return {result,table,answer:narrative+(notes.length?'\n\nChecks: '+notes.join(' '):''),warnings:notes};
 }
 answer(question,context={}){
  const parsed=this.parseQuestion(question,context);
  if(!parsed.ok)return {ok:false,status:parsed.status,answer:parsed.message,choices:parsed.choices||[],intentSource:'rule',trace:parsed.trace};
  const p=parsed.plan;
  try{
   const output=this.execute(p);
   const ranked=output.result.items||output.result.entityRanking?.items;
   let comparisonEntities=p.entities.length===2?p.entities:this.state.comparisonEntities||[];
   if(this.state.entity&&p.entity&&this.state.entity!==p.entity&&this.state.group===p.group)comparisonEntities=[this.state.entity,p.entity];
   if(this.state.group&&p.group!==this.state.group)comparisonEntities=p.entities||[];
   const keptRanked=ranked||(this.state.group===p.group?this.state.ranked:null);
   let focusRankIndex=0;
   if(p.entity&&keptRanked?.length){const ix=keptRanked.findIndex(x=>x.entity===p.entity);focusRankIndex=ix>=0?ix:(this.state.focusRankIndex||0);}else if(this.state.group===p.group&&Number.isInteger(this.state.focusRankIndex))focusRankIndex=this.state.focusRankIndex;
   this.state={...p,rankDimension:ranked?(output.result.dimension||'ENTITY'):(this.state.group===p.group?this.state.rankDimension:null),ranked:keptRanked,comparisonEntities,focusRankIndex};
   const r={ok:true,status:'answered',...output,plan:clone(p),intent:p.action,intentSource:'rule',ruleVersion:RULE_VERSION,clientGroup:p.group,entity:p.entity,driver:p.driver,period:p.period,conversationContext:{clientGroup:p.group,entity:p.entity,month:p.anchorMonth,excludedDrivers:p.excludedDrivers},evidence:{loadedRowCount:this.rows.length,source:this.options.source||'provided rows',fetchedAt:this.options.fetchedAt||null,scope:this.options.portfolioComplete?'authorised loaded portfolio':'loaded group scope'}};
   this.lastResult=r;return r;
  }catch(e){return{ok:false,status:'data_error',answer:e.message,plan:clone(p),intent:p.action,intentSource:'rule'};}
 }
}
