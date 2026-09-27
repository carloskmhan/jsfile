/** Numbers and units are deterministic typed literals; NEVER typo-corrected. */
import {overlaps,escapeRe} from './text.js';
const SMALL={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const WORD_RX='(?:one hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|'+Object.keys(SMALL).join('|')+')';
export const NUMBER_WORDS=Object.freeze([...Object.keys(SMALL),...Object.keys(TENS),'hundred']);
export function parseScalar(raw){
  const s=String(raw).trim().toLowerCase();
  if(s==='one hundred')return 100;
  if(Object.hasOwn(SMALL,s))return SMALL[s];if(Object.hasOwn(TENS,s))return TENS[s];
  const words=s.split(/[ -]/);if(words.length===2&&Object.hasOwn(TENS,words[0])&&Object.hasOwn(SMALL,words[1])&&SMALL[words[1]]>0&&SMALL[words[1]]<10)return TENS[words[0]]+SMALL[words[1]];
  if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s))throw new Error('INVALID_NUMBER');
  const n=Number(s.replaceAll(',',''));if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw new Error('UNSAFE_NUMBER');
  return n;
}
export function unitLiteral(raw,unit,registry,{currency=false,grouped=false}={}){
  const inputValue=parseScalar(raw),u=registry.units.find(x=>x.enabled&&x.phrase===unit);
  if(!u&&unit)throw new Error('INVALID_UNIT');
  if(!u&&!currency&&!grouped)throw new Error('MISSING_UNIT');
  const multiplier=u?.multiplier||1,canonicalValue=inputValue*multiplier;
  if(!Number.isFinite(canonicalValue)||Math.abs(canonicalValue)>Number.MAX_SAFE_INTEGER)throw new Error('UNSAFE_NUMBER');
  const kind=u?.kind||'absolute';
  return {inputValue,canonicalValue,unit:kind,displayUnit:unit||'base',multiplier,currency:kind==='absolute'?'USD':null,source:u?.source||{file:'fixed number syntax',line:0}};
}
const OPS={'above':'GT','over':'GT','greater than':'GT','more than':'GT','below':'LT','under':'LT','less than':'LT','at least':'GTE','greater than or equal to':'GTE','no less than':'GTE','at most':'LTE','less than or equal to':'LTE','no more than':'LTE'};
const INVERSE={GT:'LTE',GTE:'LT',LT:'GTE',LTE:'GT'};
function complement(text,start){
  const before=text.slice(0,start);
  // Only this finite relation is supported. It does not capture arbitrary exclusions.
  const m=before.match(/\b(excluding|exclude|except|without|not)\s+(?:(?:groups|entities|subsidiaries|those)\s+)?$/);
  return m?{start:m.index,end:start,text:m[0]}:null;
}
export function parseNumbers(text,names,registry){
  const spans=[],numbers=[],thresholds=[],errors=[];let topN=null,topSpan=null;
  const rankRe=new RegExp('\\b(?:top|bottom|first|largest|biggest|leading)\\s+('+WORD_RX+'|[+-]?\\d[\\d,.]*)(?![a-z0-9])','g');
  for(const m of text.matchAll(rankRe)){
    const s={start:m.index,end:m.index+m[0].length};if(names.some(n=>overlaps(n,s)))continue;
    if(topN!==null){errors.push({code:'AMBIGUOUS_NUMBER',error:'Multiple ranking limits were requested.'});break;}
    let value;try{value=parseScalar(m[1]);}catch(e){errors.push({code:e.message,error:'Invalid ranking number: '+m[1]});break;}
    if(!Number.isInteger(value)||value<1||value>registry.settings.max_top_n){errors.push({code:'INVALID_NUMBER',error:'Top N must be an integer from 1 to '+registry.settings.max_top_n+'.'});break;}
    const offset=m[0].lastIndexOf(m[1]);topSpan={kind:'n',text:m[1],raw:m[1],start:m.index+offset,end:m.index+offset+m[1].length,value,canonicalValue:value,unit:'count'};topN=value;spans.push(topSpan);numbers.push(topSpan);
  }
  const ops=Object.keys(OPS).sort((a,b)=>b.length-a.length).map(escapeRe).join('|');
  const operatorRe=new RegExp('\\b('+ops+')\\b','g');
  const units=registry.units.filter(u=>u.enabled).map(u=>u.phrase).sort((a,b)=>b.length-a.length).map(escapeRe).join('|');
  const valueRe=new RegExp('^\\s+(?:(usd)\\s*|(\\$)\\s*)?([+-]?\\d[\\d,]*(?:\\.\\d+)?|'+WORD_RX+')(?:\\s*('+units+')(?![a-z0-9]))?','u');
  for(const m of text.matchAll(operatorRe)){
    const os={start:m.index,end:m.index+m[0].length};if(names.some(n=>overlaps(n,os))||spans.some(n=>overlaps(n,os)))continue;
    const tail=text.slice(os.end);
    // In an explicit trend clause, compact 3m/6m/12m is a reporting window.
    // 'groups over 12m' remains a money threshold. Never infer a date by fuzzy.
    const compactTrend=m[1]==='over'&&/\b(?:trend|trends|history|historical trend)\b/.test(text.slice(0,os.start))&&/^\s+(?:3m|6m|12m)(?![a-z0-9])/.test(tail);
    if(m[1]==='over'&&(/^(?:\s+(?:the\s+)?(?:last|past|previous|current|time)|\s+\d+\s+months?)/.test(tail)||compactTrend))continue;
    const literal=valueRe.exec(tail);
    if(!literal){errors.push({code:'INVALID_NUMBER',error:'The numeric condition needs a valid number and unit.'});continue;}
    const end=os.end+literal[0].length;
    const after=text.slice(end);
    if(/^[a-z0-9.,]/.test(after)&&!(after==='.'||after===',')){
      errors.push({code:/^[a-z]/.test(after)?'INVALID_UNIT':'INVALID_NUMBER',error:'Invalid number/unit suffix; numeric text is never typo-corrected.'});continue;
    }
    let data;try{data=unitLiteral(literal[3],literal[4]||'',registry,{currency:!!(literal[1]||literal[2]),grouped:literal[3].includes(',')});}
    catch(e){errors.push({code:e.message,error:'Invalid or missing unit in threshold. Use 25m, 25,000,000, USD 25, or 10%.'});continue;}
    if(data.canonicalValue<0){errors.push({code:'UNSUPPORTED_MODIFIER',error:'Signed negative threshold semantics require a separate reviewed command.'});continue;}
    const neg=complement(text,os.start),op=neg?INVERSE[OPS[m[1]]]:OPS[m[1]],start=neg?.start??os.start;
    const isBps=/^(bp|bps|basis point|basis points)$/.test(data.displayUnit);
    const item={...data,kind:'threshold',raw:text.slice(start,end),text:text.slice(start,end),start,end,operatorPhrase:m[1],op,negated:!!neg,negationSpan:neg,
      // Compatibility bridge: the unchanged executor stores money in USD millions and rates in percent points.
      value:data.unit==='ratio'?data.canonicalValue*100:data.canonicalValue/1e6,metric:data.unit==='ratio'?'PERCENT':'CHANGE',executorUnit:data.unit==='ratio'?'percentage_points':'USDm',isBps};
    thresholds.push(item);spans.push(item);numbers.push(item);
  }
  if(thresholds.length>1)errors.push({code:'UNSUPPORTED_MODIFIER',error:'Multiple numeric bounds are not supported; no bound was discarded.'});
  return {topN,topSpan,threshold:thresholds[0]||null,numbers,spans,...(errors[0]||{}),errors};
}
