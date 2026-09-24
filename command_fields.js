/** Fixed field conversion used only AFTER full command-template matching. No statistical routing. */
export const RULE_VERSION = '3.0.0';
export const DRIVER_ALIASES = Object.freeze({
  CG:['credit grade','credit grading','credit rating','rating deterioration','rating downgrade','rating','downgrade','upgrade'],
  EAD:['exposure at default','exposure growth','higher exposure','exposure','new lending'],
  PD:['probability of default'], LGD:['loss given default'], FX:['foreign exchange','currency movement','currency impact','currency'],
  Maturity:['remaining maturity','maturity','tenor'], CRM:['credit risk mitigation','collateral','guarantee'],
  'Basel Method':['basel methodology','basel method','methodology','regulatory method'],
  'New Business':['new business','new deal','origination'], Novation:['novation'], Amendment:['amendment'],
  'Booking Transfer':['booking location transfer','booking transfer'], Other:['other driver','residual driver']
});
export const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[–—−]/g,'-').replace(/\bwasn't\b/g,'was not').replace(/\bisn't\b/g,'is not').replace(/\bdidn't\b/g,'did not').replace(/\bweren't\b/g,'were not').replace(/\s+/g,' ').trim();
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const aliasRe = s => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(norm(s)).replace(/ /g,'\\s+')}(?![\\p{L}\\p{N}])`,'giu');
const uniq=a=>[...new Set(a)];
export const shiftMonth=(m,n)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mo-1+n,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
export function monthRange(a,b){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(a)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b)||a>b)throw new Error('Invalid month range.');const out=[];for(let m=a;m<=b;m=shiftMonth(m,1)){out.push(m);if(out.length>120)throw new Error('Limit the period to 120 months.');}return out;}
const NUMBERS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,twenty:20};
const MON={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
const MONTH_RE=/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)(?:\s*[-/ ]\s*(20\d{2}|\d{2})(?!\d))?\b/g;
export function findNames(q,items){
 const matches=[];
 for(const item of items)for(const a of uniq(item.aliases.filter(Boolean))){for(const m of q.matchAll(aliasRe(a)))matches.push({...item,start:m.index,end:m.index+m[0].length,text:m[0]});}
 matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
 const kept=[];for(const m of matches){const overlap=kept.find(x=>m.start<x.end&&m.end>x.start);if(!overlap)kept.push(m);else if(m.start===overlap.start&&m.end===overlap.end&&m.key!==overlap.key)kept.push(m);}
 return kept.sort((a,b)=>a.start-b.start);
}
export function catalogMentions(question,groups){const q=norm(question);return findNames(q,groups.map(g=>({key:g.client_group_id,name:g.client_group_name,kind:'group',aliases:[g.client_group_id,g.client_group_name,...(g.aliases||[])]})));}
export function portfolioRequest(q){return /\b(?:top|rank|largest|biggest|leading|list|which)\b.*\b(?:groups|client groups|clients)\b|\b(?:peers|peer group|portfolio|benchmark|outlier)\b/i.test(q);}
function periodFor(q,anchor){
 const matches=[];
 for(const m of q.matchAll(/\b(20\d{2})[-/](0?[1-9]|1[0-2])(?!\d)/g))matches.push({m:`${m[1]}-${m[2].padStart(2,'0')}`,text:m[0],start:m.index});
 const year=q.match(/\b(20\d{2})\b/)?.[1]||anchor.slice(0,4);
 for(const m of q.matchAll(MONTH_RE)){if(m.index===0&&/^may (?:i|we)\b/.test(q))continue;let y=m[2]?String(m[2].length===2?2000+Number(m[2]):m[2]):year;matches.push({m:`${y}-${String(MON[m[1]]).padStart(2,'0')}`,text:m[0],start:m.index});}
 matches.sort((a,b)=>a.start-b.start);const months=uniq(matches.map(x=>x.m)),consumed=matches.map(x=>x.text);
 if(months.length>2)return {error:'Please use at most two explicit months, or a last-N-months window.'};
 if(months.length===2){
  if(/\b(compare|versus|vs|against|compared|difference|different|than|between)\b/.test(q)&&!(/\bfrom\b/.test(q)&&/\bto\b/.test(q)))return {period:{mode:'comparison',months},consumed};
  return {period:{mode:'window',start:months[0],end:months[1]},consumed};
 }
 let m=q.match(/\b(?:last|past|recent)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+months?\b/);
 if(m){const n=NUMBERS[m[1]]||Number(m[1]);if(n<1||n>120)return{error:'Choose 1–120 months.'};const end=months[0]||anchor;return {period:{mode:'window',start:shiftMonth(end,1-n),end},consumed:[...consumed,m[0]]};}
 m=q.match(/\b(3m|6m|12m)\b/);if(m){const end=months[0]||anchor;return {period:{mode:'window',start:shiftMonth(end,1-parseInt(m[1])),end},consumed:[...consumed,m[0]]};}
 m=q.match(/\bq([1-4])(?:\s+(20\d{2}))?\b/);if(m){const y=m[2]||year;return{period:{mode:'window',start:`${y}-${String(Number(m[1])*3-2).padStart(2,'0')}`,end:`${y}-${String(Number(m[1])*3).padStart(2,'0')}`},consumed:[...consumed,m[0]]};}
 if(/\b(?:last|previous) quarter\b/.test(q)){const currentStart=`${anchor.slice(0,4)}-${String(Math.floor((Number(anchor.slice(5))-1)/3)*3+1).padStart(2,'0')}`;return{period:{mode:'window',start:shiftMonth(currentStart,-3),end:shiftMonth(currentStart,-1)},consumed:['last quarter','previous quarter']};}
 if(/\b(ytd|year to date)\b/.test(q)){const end=months[0]||anchor;return{period:{mode:'window',start:end.slice(0,4)+'-01',end},consumed:[...consumed,'ytd','year to date']};}
 if(/\b(?:last|previous|prior) month\b/.test(q)){const prior=shiftMonth(months[0]||anchor,-1);if(/\b(compare|compared|versus|vs|difference|different|than)\b/.test(q))return{period:{mode:'comparison',months:[months[0]||anchor,prior]},consumed:[...consumed,'last month','previous month','prior month']};if(!months.length)return{period:{mode:'month',month:prior},consumed:['last month','previous month','prior month']};}
 if(months.length&&/\bsince\b/.test(q))return{period:{mode:'window',start:months[0],end:anchor},consumed};
 if(months.length)return{period:{mode:'month',month:months[0]},consumed};
 if(/\b(latest|current|this) month\b/.test(q))return {period:{mode:'month',month:anchor},consumed:['latest month','current month','this month']};
 return {period:null,consumed};
}
// This is an explicit vocabulary, not a statistical tokenizer or trained language model.
const WORDS = new Set(`a an the this that these those it its s i we you me us our your their please can could would should do does did is are was were has have had will may for of in at on to from by with and or as than then now how what which who where when why show tell give get list identify describe explain analyse analyze summarise summarize summary overview quick briefly brief concise shorter short detail details detailed sentence sentences one line same again also instead about within into include included including excluding exclude without except remove removing ignore ignoring off back all whole overall group groups client clients entity entities subsidiary subsidiaries affiliate affiliates legal company companies product products location locations booking bank banks portfolio peer peers benchmark against versus vs compare compared comparison difference different relative unusual outlier rank ranked ranking ranks top bottom largest smallest highest lowest biggest greatest biggest leading first second third fourth fifth next last previous prior latest current recent month monthly months period quarter year ytd trend trends pattern persistent persist continuing over time going direction up down upward downward most more much less least only solely mainly main primary dominant major important particular risk factor factors cause causes caused reason reasons behind because due responsible driven drive drove driving driver drivers contribute contributed contributing contributors contribution contributions attributable attributed attribution account accounts accounted accounting amount amounts total totals sum net gross positive negative zero flat increase increases increased increasing rise rises rising jump jumps jumped spike spikes spiked decrease decreases decreased decreasing decline declines declined fall falls fell reduction reductions reduced change changes changed movement movements move moved rwa percent percentage proportion share rate growth fx cg ead pd lgd crm maturity tenor exposure credit rating grade currency foreign exchange reconcile reconciles reconciliation reconciled match matches quality data check whether unexplained residual part portion impact impacts affected concentrated concentration concentrate broad based spread distributed many single just entity_id group_id client_group_id numbers number explainable broad-based same-direction month-on-month mom month after continuing within remaining add added brought sudden sharpest heavily respectively sort sorted exclude excluding at least at most above below under greater smaller threshold thresholded offset offsets offsetting offsetted mitigated mitigating reduction excluding applied basis values value balance balances level stock end final unchanged increased decreased cause root each both two three four five six seven eight nine ten twelve twenty finance electronics be been being there here so much result results answer answers fact facts each other those them among excluding than not isn't wasn't weren't didn't isn't hadn't half majority completely all altogether rank usdm million millions billion billions bn m b usd dollar dollars concentration technical underlying real downgrade downgraded deterioration deteriorated financial condition methodology changes might anyhow actual across explaining drivers brought biggest greatest sharp higher lower grew growth biggest fall increase risk-weighted assets finding main root help hello hi thanks thank thankyou reset clear exclusions original basis chat start new possibilities available supports supported focus focus on at end data coverage limited long business unit units products bookings compute calculate show explain explains came occur occurring occurs what happening happened summaries largely main impacted explanation reconcile reconciles reconcile total associated biggest exact anyway numeric source basis excluding material difference largest absolute holdings materiality amount half absolute comparator quarterly whether share-of-net positive-change observations jumps caused explained biggest percentage-change small large roughly around biggest largest still mainly please approximately exactly only indeed more less maximum minimum amount versus peak latest last past within how risk mean median exclusion excludes remove omit off omitted including included previous period particular performance net lower percentage increasing decreasing line shorter summary effects effect improved improve improving worse drop dropped dropping reduce reducing fell grew peak peaked trough maximum minimum original change attributable highest impact default guarantee collateral loss probability origination novation amendment regulatory method booking transfer foreign exchange new lending` .split(/\s+/));
export class FixedFieldsParser {
 constructor(options={}){this.groupAliases=options.groupAliases||{};this.entityAliases=options.entityAliases||{};this.extraWords=new Set(options.extraWords||[]);}
 parse(question,rows,context={},state={}){
  const q=norm(question),trace=['grammar-'+RULE_VERSION];
  const fail=(message,choices=[])=>({ok:false,status:'clarify',message,choices,trace});
  if(!q||q.length>1000)return fail('Enter an English RWA question of 1–1,000 characters.');
  if(/[<>`{}]/.test(q))return fail('Enter a plain-text analysis request, not code or markup.');
  if(/\b(what if|forecast|predict|recommend|should we|optimise|optimize|simulate|simulation|next month|next year|next quarter|sell|buy|approve|delete|update|execute)\b/.test(q))return fail('This tool supports historical, read-only RWA analysis, not forecasts, optimisation, transactions or counterfactual recalculation.');
  if(/\bwhy\b.*\b(rating|credit grade|credit quality)\b.*\b(deteriorat\w*|downgrad\w*|worsen\w*)\b/.test(q)&&!q.includes('rwa'))return fail('The data attributes an RWA impact to rating changes but does not explain why a rating changed. That requires approved rating-event evidence.');
  if(/\b(unless|either|correlation|causal|regression|adjusted for|risk density|rorwa|revenue|income|profit)\b/.test(q))return fail('That condition or metric is not implemented. Use RWA balance, RWA change, driver attribution or a supported comparison.');
  if(/^(help|hello|hi|thanks|thank you)[!.?]*$/.test(q))return {ok:false,status:'help',message:'Ask about RWA drivers, top entities/groups, contribution, concentration, reconciliation, trends or a comparison. Examples: “Why did Samsung spike in June?” → “Which entity?” → “Exclude FX.”',trace};
  const groupMap=new Map();for(const r of rows){if(!groupMap.has(r.client_group))groupMap.set(r.client_group,{id:r.client_group_id||r.client_group,name:r.client_group});}
  const entityMap=new Map();for(const r of rows){const key=r.client_group+'\0'+(r.entity_id||r.entity);if(!entityMap.has(key))entityMap.set(key,{key,name:r.entity,group:r.client_group,id:r.entity_id||r.entity});}
  const items=[...[...groupMap.values()].map(g=>({key:g.id,name:g.name,kind:'group',aliases:[g.id,g.name,...(this.groupAliases[g.name]||[])]})),...[...entityMap.values()].map(e=>({...e,kind:'entity',aliases:[e.id,e.name,...(this.entityAliases[e.name]||[])]}))];
  const names=findNames(q,items);let gs=uniq(names.filter(x=>x.kind==='group').map(x=>x.name)),es=uniq(names.filter(x=>x.kind==='entity').map(x=>x.name));
  for(const a of names)if(names.some(b=>b.start===a.start&&b.end===a.end&&b.key!==a.key&&b.kind===a.kind))return fail(`The name “${a.text}” is ambiguous. Use its full ID.`);
  const entityGroups=uniq(names.filter(x=>x.kind==='entity').map(x=>x.group));
  if(es.length&&gs.length&&entityGroups.some(g=>!gs.includes(g)))return fail('The named entity and group do not match. Specify one group or ask an explicit group comparison.');
  if(!gs.length&&entityGroups.length)gs=entityGroups;
  const contextGroup=context.selectedClientGroup||context.clientGroup||null;
  const conversationalRef=!!state.action&&/^(which entity|which subsidiary|which one|why|what drove|what caused|and\b|what about\b|how about\b|same\b|shorter$|briefly$|more detail$|in one sentence$|compare (?:that|it|this) with\b|rank (?:those|them) by\b|which of those\b|back to\b|clear exclusions$|remove all exclusions$|reset exclusions$|original basis$|include\b|exclude\b)/.test(q);
  let group=gs[0]||(conversationalRef?state.group:contextGroup)||contextGroup||state.group||null;
  const changed=!!(state.action&&group!==state.group);
  let entity=es[0]||context.selectedEntity||(!changed?state.entity:null)||null;
  const fullGroup=/\b(at group level|back to (?:the )?group|group level|all entities|whole group|group overall|overall group)\b/.test(q);
  if(fullGroup||gs.length&&!es.length)entity=null;
  if(/\b(that entity|that subsidiary|the first one|the second one|the third one|the fourth one|the fifth one|the largest one|the next one|next entity|one after that)\b/.test(q)||/^(why|what drove it|what drove that|what caused it|what caused that)$/.test(q)&&state.rankDimension==='ENTITY'&&state.ranked?.length){
   let index=/second/.test(q)?1:/third/.test(q)?2:/fourth/.test(q)?3:/fifth/.test(q)?4:0;
   if(/next one|next entity|one after that/.test(q))index=Math.min((Number.isInteger(state.focusRankIndex)?state.focusRankIndex:0)+1,Math.max(0,(state.ranked?.length||1)-1));
   if(!es.length){if(state.rankDimension==='ENTITY'&&state.ranked?.[index]){entity=state.ranked[index].entity;group=state.ranked[index].clientGroup||group;trace.push('rank-reference:'+index);}else if(!entity)return fail('Name the entity to inspect; there is no unambiguous entity reference in this conversation.');}
  }
  if(/\b(the two|both entities|compare them|compare the two)\b/.test(q)&&!es.length){es=state.comparisonEntities||[];if(es.length!==2)return fail('Name the two entities to compare.');}
  const anchor=context.selectedMonth||context.month||state.anchorMonth||rows.map(r=>r.month).sort().at(-1)||'2026-01';
  const dateInfo=periodFor(q,anchor);if(dateInfo.error)return fail(dateInfo.error);
  const dialogueFragment=!!state.action&&/^(and\b|what about\b|how about\b|same\b|why$|why is that$|why did that happen$|what drove (?:it|that|the first one|the second one|the third one|the fourth one|the fifth one|the next one)$|what caused (?:it|that)$|explain the (?:first|second|third|fourth|fifth|next) one$|shorter$|briefly$|more detail$|in one sentence$|compare (?:that|it|this) with\b|rank (?:those|them) by\b|which of those\b)/.test(q);
  let period=dateInfo.period||(dialogueFragment&&!changed?state.period:null)||{mode:'month',month:anchor};
  if(period.mode==='window'){try{monthRange(period.start,period.end);}catch(e){return fail(e.message);}}
  const matches=[];for(const [driver,aliases] of Object.entries({...DRIVER_ALIASES,...Object.fromEntries(rows.flatMap(r=>Object.keys(r.drivers)).filter(d=>!DRIVER_ALIASES[d]).map(d=>[d,[]]))}))for(const a of uniq([driver,...aliases]))for(const m of q.matchAll(aliasRe(a)))matches.push({driver,text:m[0],start:m.index,end:m.index+m[0].length});
  matches.sort((a,b)=>b.text.length-a.text.length);const dm=[];for(const m of matches)if(!dm.some(x=>m.start<x.end&&m.end>x.start))dm.push(m);dm.sort((a,b)=>a.start-b.start);
  let excludedDrivers=changed?[]:[...(state.excludedDrivers||[])],excludedEntities=changed?[]:[...(state.excludedEntities||[])];
  const clearExclusions=/\b(clear exclusions|remove all exclusions|reset exclusions|original basis)\b/.test(q);
  if(clearExclusions){excludedDrivers=[];excludedEntities=[];trace.push('clear-exclusions');}
  const ex=/\b(excluding|exclude|without|ignore|remove|except)\b/.exec(q);
  const included=/\b(include|including|restore|put back|add back)\b/.exec(q);
  let driver=null;
  if(ex){
   const targets=dm.filter(d=>d.start>ex.index),ents=names.filter(n=>n.kind==='entity'&&n.start>ex.index);
   if(!targets.length&&!ents.length)return fail('Specify the driver or named entity to exclude, for example “Exclude FX”.');
   excludedDrivers=uniq([...excludedDrivers,...targets.map(x=>x.driver)]);excludedEntities=uniq([...excludedEntities,...ents.map(x=>x.name)]);
   if(ents.length){entity=null;es=es.filter(e=>!excludedEntities.includes(e));}
   driver=dm.find(d=>d.start<ex.index)?.driver||null;trace.push('exclude-attributed-contributions');
  }else if(included){
   const targets=dm.filter(d=>d.start>included.index).map(x=>x.driver),ents=names.filter(n=>n.kind==='entity'&&n.start>included.index).map(x=>x.name);
   if(!targets.length&&!ents.length)return fail('Specify the driver or entity to include again.');
   excludedDrivers=excludedDrivers.filter(d=>!targets.includes(d));excludedEntities=excludedEntities.filter(e=>!ents.includes(e));
  }else driver=dm[0]?.driver||null;
  if(!ex&&!included&&uniq(dm.map(x=>x.driver)).length>1)return fail('Ask about one driver at a time, or request the overall driver breakdown. Multiple drivers can be excluded together.');
  const hasCompare=/\b(compare|compared|comparison|versus|vs|against|difference|different|benchmark|peer|peers|outlier|unusual)\b/.test(q);
  const subjectText=names.reduce((s,n)=>s.replace(aliasRe(n.text),` ${n.kind} `),q);
  let action=null,dimension=null,metric='CHANGE',direction='AUTO',topN=5,checkMode='CONTRIBUTES';
  const top=q.match(/\b(?:top|bottom|largest|biggest|leading|first)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twenty)\b/);
  if(top){topN=NUMBERS[top[1]]||Number(top[1]);if(topN<1||topN>50)return fail('Choose a top-N value from 1 to 50.');}
  if(/\b(decrease|decline|fall|drop|reduction|negative|decreased|declined)\b/.test(q))direction='DOWN';
  if(/\b(increase|rise|jump|spike|positive|increased|grew)\b/.test(q)&&direction==='AUTO')direction='UP';
  if(/\b(bottom|lowest|smallest|minimum|trough)\b/.test(q))direction='DOWN';
  if(/\b(absolute|magnitude)\b/.test(q))direction='ABSOLUTE';
  const explicitPercentMetric=/\b(percentage|percent|%|growth rate)\b/.test(q)&&/\b(increase|change|growth|rise|drop|decrease)\b/.test(q)&&!dm.length;
  const explicitBalanceMetric=/\b(balance|balances|level|stock|highest rwa|lowest rwa|current rwa)\b/.test(q);
  if(explicitPercentMetric)metric='PERCENT';
  if(explicitBalanceMetric)metric='BALANCE';
  if(/\b(reconcil\w*|data quality|unexplained|residual)\b|\bsum of drivers\b.*\bmatch\b/.test(q))action='DATA_QUALITY';
  else if(/\b(concentrat\w*|broad[ -]based|spread across|distributed|single entity|single subsidiary|one subsidiary|one entity|many entities)\b/.test(q))action='CONCENTRATION';
  else if(/\b(offset\w*|mitigat\w*)\b/.test(q))action='OFFSETS';
  else if(/\b(when|which month|identify the month|peak|peaked|peak month|trough|maximum|minimum)\b/.test(q)){action='PEAK_MONTH';if(/\bpeak(?:ed)?\b/.test(q)&&!/(spike|jump|increase|change|rise|decline)/.test(q))metric='BALANCE';}
  else if(/\b(trend|pattern|persistent|continuing|over time|going up|going down|month after month)\b/.test(q)||period.mode==='window'&&/\b(over|since|ytd|year to date)\b/.test(q))action='TREND';
  else if(hasCompare||period.mode==='comparison'||gs.length>1||es.length>1)action='COMPARE';
  else if(/\b(top|largest|biggest|leading|which|list|rank|show)\b/.test(q)&&/\b(groups|client groups|clients)\b/.test(q)){action='TOP_CLIENTS';dimension='GROUP';group=null;entity=null;}
  else if(/\b(top|largest|biggest|leading|which|list|rank|show|where)\b/.test(q)&&(/\b(entities|entity|subsidiar\w*|affiliates?|legal entities|company|companies|products?|locations?|bookings?)\b/.test(q)||/where did most/.test(q))){action='TOP_ENTITY';dimension=/\bproducts?\b/.test(q)?'PRODUCT':/\b(locations?|bookings?)\b/.test(q)?'LOCATION':'ENTITY';entity=null;}
  else if(dm.length&&/^(?:was|were|did|is|are|has|have|wasn't|isn't|didn't)\b/.test(q)){action='DRIVER_CHECK';checkMode=/\b(only|solely|sole)\b/.test(q)?'SOLE':/\b(main|mainly|primary|dominant|largest|biggest|most|majority)\b/.test(q)?'MAIN':'CONTRIBUTES';}
  else if(dm.length&&/\b(how much|what was|what is|show|give|and|what about|how about|contribut\w*|amount|share|proportion|percentage|percent|attribut\w*)\b/.test(q)&&!ex&&!included)action='DRIVER_CONTRIBUTION';
  else if(/\b(how much|contribution|share|proportion)\b/.test(q)&&/\b(entity|subsidiar\w*|affiliate)\b/.test(subjectText))action='ENTITY_CONTRIBUTION';
  else if(/\b(main|primary|dominant|largest|biggest|greatest|important|most)\b.*\b(driver|factor|cause|reason|impact)\b|\bwhich risk factor\b|\bmain driver\b/.test(q))action='MAIN_DRIVER';
  else if(/\b(why|explain|analyse|analyze|summary|summarise|summarize|overview|what happened|what drove|what caused|what changed|what explains|root cause|drivers behind|reasons behind|tell me about|how is)\b/.test(q))action=entity||/\b(this entity|that entity|this subsidiary|that subsidiary)\b/.test(q)?'ENTITY_DRIVER':'GROUP_ROOT_CAUSE';
  else if(/\b(how much|what is|what was|show|give)\b/.test(q)&&/\b(rwa|balance|change|movement|increase|decrease)\b/.test(q))action='GROUP_ROOT_CAUSE';
  // Follow-up fragments only inherit after a successful request.
  const follow=!!state.action&&(ex||included||clearExclusions||dateInfo.period||es.length||gs.length||fullGroup||/^(and|what about|how about|same|shorter|briefly|more detail|in one sentence|summari[sz]e|compare the two|why|what drove|what caused|rank those|rank them|which of those|back to)\b/.test(q));
  if(!action&&follow){action=state.action;dimension=state.dimension;metric=(explicitPercentMetric||explicitBalanceMetric)?metric:(state.metric||metric);direction=state.direction||direction;topN=state.topN||topN;driver=driver||state.driver;checkMode=state.checkMode||checkMode;trace.push('follow-up');}
  if(clearExclusions&&state.action){action=state.action;dimension=state.dimension;metric=state.metric||metric;direction=state.direction||direction;topN=state.topN||topN;driver=state.driver||driver;checkMode=state.checkMode||checkMode;}
  if(/^(why|what drove it|what drove that|what caused it|what caused that)$/.test(q)&&entity)action='ENTITY_DRIVER';
  if(/\b(rank those|rank them|which of those|of those|among those)\b/.test(q)&&state.rankDimension==='ENTITY'&&state.ranked?.length){dimension='ENTITY';action='TOP_ENTITY';entity=null;trace.push('prior-ranked-subset');}
  if(/\b(shorter|briefly|one sentence|one line|concise)\b/.test(q)&&state.action&&!hasCompare&&!/why|caused|drove/.test(q)){action=state.action;dimension=state.dimension;driver=driver||state.driver;}
  if(fullGroup&&['ENTITY_DRIVER','ENTITY_CONTRIBUTION'].includes(action))action='GROUP_ROOT_CAUSE';
  if(entity&&state.action==='TOP_ENTITY'&&!hasCompare&&follow&&action==='TOP_ENTITY')action='ENTITY_DRIVER';
  if(!action&&names.length)action=entity||/\b(this entity|that entity|this subsidiary|that subsidiary)\b/.test(q)?'ENTITY_DRIVER':'GROUP_ROOT_CAUSE';
  if(!action)return fail('I could not map this question to an approved analysis. Try “Explain the RWA movement”, “Top entities” or “Show the trend”.');
  if(action==='PEAK_MONTH'&&!dateInfo.period)period={mode:'history',end:anchor};
  if(action==='TREND'&&!dateInfo.period&&period.mode!=='window')period={mode:'window',start:shiftMonth(anchor,-2),end:anchor};
  if(action==='COMPARE'&&!hasCompare&&!changed&&!gs.length&&!es.length&&state.action==='COMPARE'){if(state.entities?.length===2)es=[...state.entities];if(state.groups?.length===2)gs=[...state.groups];}
  if(action==='COMPARE'&&gs.length<=1&&es.length<=1&&period.mode!=='comparison'&&!/\b(peers?|benchmark|outlier|unusual|portfolio|other groups)\b/.test(q))return fail('Compare which two months or entities?', ['Compare June 2026 with May 2026','Compare with peers']);
  if(action==='COMPARE'&&gs.length>1&&es.length>1)return fail('Compare two groups or two entities, not both at once.');
  if(gs.length>2||es.length>2)return fail('Compare at most two named groups or entities.');
  const peer=action==='COMPARE'&&gs.length<=1&&es.length<=1&&period.mode!=='comparison';
  if(peer&&!group)return fail('Name the group to benchmark against the loaded portfolio.');
  if(action!=='TOP_CLIENTS'&&!group)return fail('Which client group should I analyse? Enter a full group name or group ID.');
  if(entity&&!rows.some(r=>r.client_group===group&&r.entity===entity))return fail('That entity is not in the current authorised group data.');
  if(['ENTITY_DRIVER','ENTITY_CONTRIBUTION'].includes(action)&&!entity)return fail('Which entity should I analyse?');
  let condition=null;const threshold=q.match(/\b(more than|greater than|above|over|at least|less than|below|under|at most)\s*\$?\s*(\d+(?:\.\d+)?)\s*(bn|billion|million|m|b|%)(?![a-z0-9])/);
  if(threshold){const amount=Number(threshold[2])*(/bn|billion|^b$/.test(threshold[3])?1000:1);condition={op:/more|greater|above|over/.test(threshold[1])?'GT':threshold[1]==='at least'?'GTE':threshold[1]==='at most'?'LTE':'LT',value:amount,metric:threshold[3]==='%'?'PERCENT':driver?'DRIVER':'CHANGE'};if(!['TOP_ENTITY','TOP_CLIENTS'].includes(action))return fail('Amount thresholds are supported for contributor rankings only.');}
  if(condition?.metric==='PERCENT'&&driver)return fail('Percentage thresholds on driver shares are not implemented. Use a driver amount threshold.');
  if(/\b(above|below|greater than|less than|at least|at most)\b/.test(q)&&!condition)return fail('Give the threshold with an explicit unit, for example “above $100m”.');
  if(/\bnot\b/.test(q)&&(action!=='DRIVER_CHECK'||! /^(was|is|did|were) not\b/.test(q)))return fail('Use an explicit exclusion such as “excluding FX” rather than an ambiguous negation.');
  // All unrecognised content words/numbers are surfaced, never silently discarded.
  let remainder=q;
  for(const n of names)remainder=remainder.replace(aliasRe(n.text),' ');
  for(const d of dm)remainder=remainder.replace(aliasRe(d.text),' ');
  for(const t of dateInfo.consumed||[])remainder=remainder.replace(aliasRe(t),' ');
  if(top)remainder=remainder.replace(top[0],' ');if(threshold)remainder=remainder.replace(threshold[0],' ');
  remainder=remainder.replace(/\bq[1-4]\b/g,' ').replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\b/g,' ');
  const unknown=uniq((remainder.match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>!WORDS.has(w)&&!this.extraWords.has(w)));
  if(unknown.length)return fail(`I have not interpreted: ${unknown.slice(0,6).join(', ')}. Rephrase or add an approved alias/rule; no calculation was executed.`);
  if(['DRIVER_CHECK','DRIVER_CONTRIBUTION'].includes(action)&&!driver)return fail('Name the driver, for example CG, EAD or FX.');
  if(driver&&excludedDrivers.includes(driver)&&['DRIVER_CHECK','DRIVER_CONTRIBUTION'].includes(action))return fail(`${driver} is excluded by the current conditions. Say “Include ${driver}” first.`);
  const candidateEntities=/\b(rank those|rank them|which of those|of those|among those)\b/.test(q)&&state.rankDimension==='ENTITY'&&state.ranked?.length?state.ranked.map(x=>x.entity).filter(Boolean):[];
  const plan={action,group,entity,groups:gs.length>1?gs:[],entities:es.length>1?es:[],peer,dimension,driver,period,topN,metric,direction,excludedDrivers,excludedEntities,candidateEntities,condition,checkMode,concise:/\b(shorter|briefly|one sentence|one line|concise)\b/.test(q),trace:[...trace,action],anchorMonth:period.month||period.end||period.months?.[0]||anchor};
  return {ok:true,plan};
 }
}
