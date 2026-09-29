/** 6.0.12: one historical monthly percentage extremum per client-group ID.
 * No inference, no forecasts and no substitution of missing/zero/derived bases.
 * Previous-month closing totals take priority over row-supplied opening totals.
 * This is a separate balance-history report: it does NOT change driver attribution.
 */
import {isDerivedPrevious} from './csv_adapter.js';
import {monthRange,shiftMonth} from './semantic/periods.js';
const EPS=1e-8;
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const total=(values)=>{
  const n=values.reduce((a,b)=>a+b,0);
  if(!Number.isFinite(n))throw new Error('Historical group aggregation overflowed. No percentage ranking was returned.');
  return n;
};
export function rankHistoricalGroupPeaks(engine,p){
  if(engine.options.unit!=='USDm')throw new Error('Historical percentage reporting currently requires the existing USDm data basis.');
  if(!engine.options.portfolioComplete)throw new Error('Historical group ranking requires a fresh complete authorised portfolio response.');
  if(p.metric!=='PERCENT'||!['UP','DOWN'].includes(p.direction))throw new Error('Historical group peaks require highest or lowest monthly percentage change.');
  if(p.driver||p.condition||p.excludedDrivers.length||p.excludedEntities.length||p.excludedEntityIds?.length)
    throw new Error('Driver/entity exclusions or threshold filters are not supported by historical group percentage peaks.');
  if(p.group||p.groupId||p.entity||p.entityId||p.groups.length||p.entities.length)throw new Error('Historical group ranking is a portfolio report, not a named-subject comparison.');
  const maxMonths=engine.parser.registry.settings.max_window_months;
  if(!Number.isInteger(p.topN)||p.topN<1||p.topN>engine.parser.registry.settings.max_top_n)throw new Error('Historical ranking limit is outside the configured range.');
  if(p.candidateGroups?.length&&!p.candidateGroupIds?.length)throw new Error('Historical candidate sets require system group IDs.');
  const source=engine.baseRows({...p,group:null,groupId:null,entity:null,entityId:null});
  const candidates=new Set(p.candidateGroupIds||[]);
  const rows=candidates.size?source.filter(r=>candidates.has(r.client_group_id)):source;
  if(!rows.length)throw new Error('No authorised group data remains for the requested historical ranking.');
  const allMonths=[...new Set(rows.map(r=>r.month))].sort();
  let start,end;
  if(p.period.mode==='month')start=end=p.period.month;
  else if(p.period.mode==='window')({start,end}=p.period);
  else if(p.period.mode==='history'){end=p.period.end;start=allMonths.find(m=>m<=end);}
  else throw new Error('Historical group ranking needs one history window.');
  if(!start||!end)throw new Error('No history is available through the selected reference month.');
  const months=monthRange(start,end,maxMonths);
  const priorMonths=new Map(months.map(month=>[month,shiftMonth(month,-1)]));
  const grouped=new Map();
  for(const r of rows){
    if(typeof r.client_group_id!=='string'||!r.client_group_id.trim())throw new Error('Historical group ranking requires a string system group ID on every row.');
    const id=r.client_group_id;
    if(!grouped.has(id))grouped.set(id,{id,labels:new Map(),raw:new Map()});
    const g=grouped.get(id);
    if(!g.raw.has(r.month))g.raw.set(r.month,[]);
    g.raw.get(r.month).push(r);
    if(!g.labels.has(r.month))g.labels.set(r.month,new Set());
    g.labels.get(r.month).add(r.client_group);
  }
  const skippedByReason={NO_CURRENT_MONTH:0,NO_OBSERVED_PREVIOUS:0,NON_POSITIVE_PREVIOUS:0};
  const values=[],coverage=[],warnings=[];let completeGroups=0,openingDisagreements=0;
  const low=p.direction==='DOWN';
  for(const [id,g] of grouped){
    const monthly=new Map();
    for(const [month,rr] of g.raw){
      monthly.set(month,{curr:total(rr.map(r=>r.rwa_curr)),prev:total(rr.map(r=>r.rwa_prev)),derived:rr.some(r=>isDerivedPrevious(r)||r.attributes?.rwa_prev_source?.startsWith('derived_'))});
    }
    const points=[],skippedCounts={NO_CURRENT_MONTH:0,NO_OBSERVED_PREVIOUS:0,NON_POSITIVE_PREVIOUS:0};
    for(const month of months){
      const current=monthly.get(month);
      let reason=null,prev=null,basis=null;
      if(!current)reason='NO_CURRENT_MONTH';
      else {
        const preceding=monthly.get(priorMonths.get(month));
        if(preceding){
          prev=preceding.curr;basis='observed prior-month closing';
          if(!current.derived&&Math.abs(current.prev-prev)>engine.options.reconciliationTolerance)openingDisagreements++;
        }else if(!current.derived){prev=current.prev;basis='explicitly reported previous';}
        else reason='NO_OBSERVED_PREVIOUS';
        if(!reason&&prev<=0)reason='NON_POSITIVE_PREVIOUS';
      }
      if(reason){skippedCounts[reason]++;skippedByReason[reason]++;continue;}
      const change=current.curr-prev,rate=change/prev;
      if(!Number.isFinite(change)||!Number.isFinite(rate))throw new Error('A historical monthly percentage is not finite. No ranking was produced.');
      points.push({month,change,rate,rwa_curr:current.curr,rwa_prev:prev,previousBasis:basis});
    }
    const isComplete=points.length===months.length;if(isComplete)completeGroups++;
    coverage.push({groupId:id,eligibleMonths:points.length,requestedMonths:months.length,complete:isComplete,skippedByReason:skippedCounts});
    if(!points.length)continue;
    // Percentage determines the winning month; absolute amounts never do.
    points.sort((a,b)=>(low?a.rate-b.rate:b.rate-a.rate)||cmp(b.month,a.month));
    const best=points[0],tied=points.filter(x=>Math.abs(x.rate-best.rate)<EPS).sort((a,b)=>cmp(b.month,a.month));
    const selected=tied[0];
    const labelMonth=[...g.labels.keys()].filter(m=>m<=end).sort().at(-1)||[...g.labels.keys()].sort()[0];
    const name=[...g.labels.get(labelMonth)].sort(cmp)[0];
    values.push({key:id,id,groupId:id,name,displayName:name,...selected,value:selected.rate*100,
      eligibleMonths:points.length,requestedMonths:months.length,completeHistory:isComplete,tiedMonths:tied.map(x=>x.month),points});
  }
  values.sort((a,b)=>(low?a.rate-b.rate:b.rate-a.rate)||cmp(a.groupId,b.groupId));
  const items=values.slice(0,p.topN);
  for(let i=0;i<items.length;i++)items[i].rank=i&&Math.abs(items[i].rate-items[i-1].rate)<EPS?items[i-1].rank:i+1;
  if(openingDisagreements)warnings.push(`${openingDisagreements} explicitly reported opening totals differ from the adjacent month's closing total. This report consistently uses the observed adjacent-month closing total when available.`);
  return {dimension:'GROUP',items,all:values,eligible:values.length,loaded:grouped.size,completeGroups,months,start,end,
    skippedMonthCount:Object.values(skippedByReason).reduce((a,b)=>a+b,0),skippedByReason,coverage,
    partial:completeGroups<grouped.size,openingDisagreements,warnings,
    metric:'monthly_percentage_change',selection:low?'per_group_minimum':'per_group_maximum',
    historyBasis:'observed prior-month closing totals, then explicitly reported previous balances; derived previous bases excluded',
    cohortBasis:'Group totals reflect each month\'s recorded membership, not a constant-membership cohort.'};
}
