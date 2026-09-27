import {uniq,overlaps,escapeRe} from './text.js';
import {parseScalar} from './numbers.js';
export function shiftMonth(month,n){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
export function monthRange(start,end,max=120){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(end)||start>end)throw new Error('Invalid chronological month range.');
 const out=[];for(let m=start;m<=end;m=shiftMonth(m,1)){out.push(m);if(out.length>max)throw new Error('Period exceeds '+max+' months.');}return out;
}
const DEFAULT_MONTHS={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
/** Finite CSV terms plus typed ISO/quarter/window syntax. Anchor is an analysis month, NEVER Date.now(). */
export function parsePeriods(text,anchor,blocked=[],max=120,definitions=[]){
 const spans=[],found=[],windowHits=[];const fail=(code,error)=>({code,error,spans,anchor});
 const available=s=>!blocked.some(b=>overlaps(b,s));
 const add=(m,month,source=null)=>{const s={start:m.index,end:m.index+m[0].length,text:m[0],raw:m[0],kind:'period',month,source};if(available(s)&&!spans.some(b=>overlaps(b,s))){spans.push(s);if(month)found.push(s);return true;}return false;};
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(anchor))return fail('MISSING_PERIOD','No valid report month is available; select one.');
 for(const m of text.matchAll(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|q\d+)\b/g))if(available({start:m.index,end:m.index+m[0].length})&&(!/^q[1-4]$/.test(m[0])))return fail('INVALID_PERIOD','Use a valid reporting month or quarter, not an invalid quarter or day-level date.');
 for(const m of text.matchAll(/\b(20\d{2})[-/](\d{1,2})(?![\d-])/g)){
  if(!available({start:m.index,end:m.index+m[0].length}))continue;
  if(+m[2]<1||+m[2]>12)return fail('INVALID_PERIOD','Invalid month '+m[0]+'.');add(m,`${m[1]}-${m[2].padStart(2,'0')}`,{file:'fixed ISO month syntax'});
 }
 const defs=definitions.filter(d=>d.enabled),monthDefs=defs.filter(d=>d.kind==='MONTH');
 const MONTHS=monthDefs.length?Object.fromEntries(monthDefs.map(d=>[d.phrase,d.value])):DEFAULT_MONTHS;
 const yearMatch=[...text.matchAll(/\b(20\d{2})\b/g)].find(m=>available({start:m.index,end:m.index+m[0].length}));
 const year=yearMatch?.[1]||anchor.slice(0,4);
 const monthRe=new RegExp('\\b('+Object.keys(MONTHS).sort((a,b)=>b.length-a.length).map(escapeRe).join('|')+')(?:\\s*[-/ ]\\s*(20\\d{2}|\\d{2})(?!\\d))?\\b','g');
 for(const m of text.matchAll(monthRe)){
  if(m.index===0&&/^may (i|we)\b/.test(text))continue;
  const y=m[2]?(m[2].length===2?String(2000+Number(m[2])):m[2]):year;
  add(m,`${y}-${String(MONTHS[m[1]]).padStart(2,'0')}`,monthDefs.find(d=>d.phrase===m[1])?.source);
 }
 found.sort((a,b)=>a.start-b.start);const months=uniq(found.map(x=>x.month));
 const relDefs=defs.filter(d=>d.kind!=='MONTH');
 const rel=[];
 for(const d of relDefs)for(const m of text.matchAll(new RegExp('\\b'+escapeRe(d.phrase)+'\\b','g')))if(add(m,null,d.source))rel.push(d);
 for(const m of text.matchAll(/\bq([1-4])(?:\s+(20\d{2}))?\b/g))if(add(m,null,{file:'fixed quarter syntax'}))windowHits.push({kind:'quarter',year:m[2]||year,q:+m[1]});
 const windowRe=/\b(?:(?:last|past|recent)\s+)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\s+months?\b|\b(3m|6m|12m)\b/g;
 for(const m of text.matchAll(windowRe))if(add(m,null,{file:'fixed N-month window syntax'}))windowHits.push({kind:'months',count:m[2]?parseInt(m[2]):parseScalar(m[1])});
 if(months.length>2||windowHits.length>1||rel.length>1)return fail('AMBIGUOUS_PERIOD','Multiple or conflicting temporal expressions were supplied. Use one range or one comparison.');
 if(months.length===2&&(windowHits.length||rel.length))return fail('AMBIGUOUS_PERIOD','Explicit period pair conflicts with another temporal modifier.');
 if(months.length===2){
  const range=/\b(from|through|until)\b/.test(text)||/\bto\b/.test(text)&&!/\b(compare|compared|versus|vs|difference)\b/.test(text);
  if(!range&&!/\b(compare|compared|versus|vs|difference|different|than|between)\b/.test(text))return fail('AMBIGUOUS_PERIOD','Two months need an explicit comparison or range relation.');
  const period=range?{mode:'window',start:months[0],end:months[1]}:{mode:'comparison',months};
  try{if(range)monthRange(period.start,period.end,max);}catch(e){return fail('INVALID_PERIOD',e.message);}return{period,spans,anchor};
 }
 if(windowHits.length&&rel.length)return fail('AMBIGUOUS_PERIOD','A window and relative period cannot silently override one another.');
 if(windowHits[0]){
  const w=windowHits[0];if(w.kind==='quarter'){
   if(months.length)return fail('AMBIGUOUS_PERIOD','A named month and a quarter were both specified.');
   return{period:{mode:'window',start:`${w.year}-${String(w.q*3-2).padStart(2,'0')}`,end:`${w.year}-${String(w.q*3).padStart(2,'0')}`},spans,anchor};
  }
  if(w.count<1||w.count>max)return fail('INVALID_PERIOD','Choose 1–'+max+' months.');const end=months[0]||anchor;
  return{period:{mode:'window',start:shiftMonth(end,1-w.count),end},spans,anchor};
 }
 if(rel[0]){
  const r=rel[0],base=months[0]||anchor;
  if(r.kind==='YTD')return{period:{mode:'window',start:base.slice(0,4)+'-01',end:base},spans,anchor};
  if(r.kind==='RELATIVE_QUARTER'){
   if(months.length)return fail('AMBIGUOUS_PERIOD','A named month and relative quarter were both supplied.');
   const start=shiftMonth(`${anchor.slice(0,4)}-${String(Math.floor((+anchor.slice(5)-1)/3)*3+1).padStart(2,'0')}`,r.value*3);
   return{period:{mode:'window',start,end:shiftMonth(start,2)},spans,anchor};
  }
  if(r.kind==='RELATIVE_MONTH'){
   if(months.length&&!/\b(compare|compared|versus|vs|difference|than)\b/.test(text))return fail('AMBIGUOUS_PERIOD','Explicit and relative month conflict; specify a comparison.');
   const target=shiftMonth(base,r.value);return{period:r.value!==0&&/\b(compare|compared|versus|vs|difference|than)\b/.test(text)?{mode:'comparison',months:[base,target]}:{mode:'month',month:target},spans,anchor};
  }
 }
 if(months.length){const period=/\bsince\b/.test(text)?{mode:'window',start:months[0],end:anchor}:{mode:'month',month:months[0]};return{period,spans,anchor};}
 return{period:null,spans,anchor};
}
