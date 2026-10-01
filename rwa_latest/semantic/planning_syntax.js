/** Typed original-span grammar. Tokens are never rewritten into another English question. */
import {clone,tokenize,overlaps,uniq} from './text.js';

export class MeaningError extends Error {
  constructor(code,message,field=null){super(message);this.code=code;this.field=field;}
}
const stop=(message,field=null,code='UNSUPPORTED_SEMANTIC_STRUCTURE')=>{throw new MeaningError(code,message,field);};
const inverse={LT:'GTE',LTE:'GT',GT:'LTE',GTE:'LT'};

/** Identity/driver/date/number spans become typed atoms. All other tokens must be consumed. */
export function meaningTokens(text,slots){
  const atoms=[...slots.names.map(s=>({...s,type:'NAME',value:s.item})),
    ...slots.drivers.map(s=>({...s,type:'DRIVER',value:s.driver})),
    ...slots.periodSpans.map(s=>({...s,type:'PERIOD',value:slots.period})),
    ...slots.references.map(s=>({...s,type:'REF',value:s.index})),
    ...(slots.topSpan?[{...slots.topSpan,type:'COUNT',value:slots.topN}]:[]),
    ...(slots.threshold?[{...slots.threshold,type:'BOUND',value:slots.threshold}]:[])].sort((a,b)=>a.start-b.start||b.end-a.end);
  for(let i=1;i<atoms.length;i++)if(overlaps(atoms[i-1],atoms[i]))stop('Overlapping typed parameters need an explicit reformulation.');
  const tokens=[];let offset=0;
  const gap=(a,b)=>tokens.push(...tokenize(text.slice(a,b)).map(t=>({...t,start:t.start+a,end:t.end+a,type:'WORD'})));
  for(const a of atoms){gap(offset,a.start);tokens.push(a);offset=a.end;}gap(offset,text.length);
  return tokens;
}
class Cursor {
  constructor(tokens,text){this.tokens=tokens;this.text=text;this.i=0;this.ledger=[];}
  peek(){return this.tokens[this.i];}
  word(...words){const t=this.peek();return t?.type==='WORD'&&words.includes(t.text);}
  eat(...words){return this.word(...words)?this.tokens[this.i++]:null;}
  require(word,field){const t=this.eat(word);if(!t)stop('Expected “'+word+'” near '+this.near()+'.',field);return t;}
  atom(type,field){const t=this.peek();if(t?.type!==type)stop('Specify '+field+' explicitly near '+this.near()+'.',field,'AMBIGUOUS_SEMANTIC_SLOT');this.i++;return t;}
  near(){return this.peek()?'“'+this.text.slice(this.peek().start,Math.min(this.text.length,this.peek().start+48))+'”':'the end of the question';}
  mark(start,role,value){const taken=this.tokens.slice(start,this.i);if(taken.length)this.ledger.push({role,start:taken[0].start,end:taken.at(-1).end,text:this.text.slice(taken[0].start,taken.at(-1).end),value:clone(value)});}
  end(){while(this.eat('.','?','!')){}if(this.peek())stop('Unresolved qualifier near '+this.near()+'. No condition was discarded.','qualifier');}
}
function month(c,slots){const p=c.atom('PERIOD','reporting month');if(slots.period?.mode!=='month')stop('This structured request needs one reporting month, not a window or comparison.','period');return p;}
function motion(c,lex){
  const t=c.peek();if(!t||t.type!=='WORD')return null;
  if(c.word('change','movement')){c.i++;return 'AUTO';}
  if(c.eat('increase','growth'))return 'UP';
  if(c.eat('decrease','decline'))return 'DOWN';
  const hit=lex.matches.find(m=>m.start===t.start&&m.end===t.end&&['INCREASE','DECREASE'].includes(m.concept));
  if(!hit)return null;c.i++;return hit.concept==='DECREASE'?'DOWN':'UP';
}
function measure(c,lex){
  const start=c.i;let metric='CHANGE',direction='AUTO',driver=null,rwa=false;
  if(c.peek()?.type==='DRIVER'){
    driver=c.atom('DRIVER','ranking driver').value;
    if(!c.eat('contribution','attribution'))stop('Rank a named driver by its contribution to RWA.','rankingMeasure');
    c.require('to','rankingMeasure');c.eat('the');c.require('rwa','rankingMeasure');rwa=true;
    direction=motion(c,lex)??'AUTO';
  }else{
    const closing=!!c.eat('closing');rwa=!!c.eat('rwa');
    const trailingClosing=!closing&&!!c.eat('closing');
    if(c.eat('balance')){metric='BALANCE';if(!rwa)stop('Specify RWA balance as the ranking measure.','rankingMeasure');}
    else{
      if(closing||trailingClosing)stop('Specify closing RWA balance, not closing movement.','rankingMeasure');
      if(c.eat('percentage','percent')){metric='PERCENT';c.eat('rwa');}
      direction=motion(c,lex);
      if(direction===null)stop('Rank by RWA balance, RWA increase/decrease, or RWA percentage change.','rankingMeasure','AMBIGUOUS_METRIC');
      if(!rwa&&metric!=='PERCENT')stop('Name RWA explicitly as the measure.','rankingMeasure');
    }
  }
  const value={metric,direction,driver,rwa};c.mark(start,'RANK_MEASURE',value);return value;
}
function driverList(c){
  const list=[c.atom('DRIVER','driver to include or exclude')];
  while(c.eat('and'))list.push(c.atom('DRIVER','driver to include or exclude'));
  if(list.length>4||new Set(list.map(x=>x.value)).size!==list.length)stop('Use at most four distinct driver selections.','exclusion');
  return list;
}
function target(c){
  if(c.eat('client')){c.require('groups','target');return 'GROUP';}
  if(c.eat('groups'))return 'GROUP';
  if(c.eat('entities','subsidiaries'))return 'ENTITY';
  stop('Specify groups or entities as the ranking target.','target','AMBIGUOUS_SCOPE');
}

/** Components, not customer-specific question templates. Only supported executor combinations survive. */
export function parseRoleRanking(text,lex,slots,maxClauses){
  const c=new Cursor(meaningTokens(text,slots),text);c.eat('please');c.eat('show','rank','list');c.eat('the');
  const start=c.i,order=c.eat('top','bottom');if(!order)return null;
  const count=c.atom('COUNT','ranking count'),dimension=target(c);c.mark(start,'RANK_TARGET',{dimension,limit:count.value});
  let subject=null;
  if(c.eat('for','within')){subject=c.atom('NAME','authorised client group');if(dimension!=='ENTITY'||subject.value.kind!=='GROUP')stop('Named scope in this grammar is for an entity ranking within one group.','target');c.mark(c.i-2,'SUBJECT',subject.value);}
  c.require('by','rankingMeasure');const m=measure(c,lex);
  if(order.text==='bottom'&&m.direction!=='DOWN')stop('For this grammar, use top with an increase or bottom with a decrease. Smallest positive increases need a separate report.','direction','AMBIGUOUS_DIRECTION');
  const result={shape:'RANKING_ROLES',action:dimension==='GROUP'?'TOP_CLIENTS':'TOP_ENTITY',dimension,subject:subject?.value||null,
    metric:m.metric,direction:m.direction,driver:m.driver,topN:count.value,period:null,condition:null,excludedDrivers:[],includedDrivers:[],operations:[],ledger:c.ledger};
  let clauses=0,hasNewRole=false;
  while(c.peek()&&!c.word('.','?','!')){
    c.eat(',');if(!c.peek())stop('A trailing comma needs a complete clause.');const before=c.i;
    if(++clauses>maxClauses)stop('Too many independent clauses; split the question.','clause','SEMANTIC_PLAN_LIMIT');
    if(c.eat('in','during','for')){
      if(result.period)stop('Specify one reporting month.','period','AMBIGUOUS_PERIOD');
      result.period=clone(month(c,slots).value);c.mark(before,'PERIOD',result.period);continue;
    }
    let excluding=false,after=false;
    if(c.eat('after')){after=true;if(!c.eat('excluding','exclude'))stop('After must introduce an explicit driver exclusion.','exclusion');excluding=true;}
    else if(c.eat('excluding','exclude'))excluding=true;
    if(excluding&&c.peek()?.type==='DRIVER'){
      if(result.excludedDrivers.length)stop('Combine driver exclusions into one explicit list.','exclusion');
      result.excludedDrivers=driverList(c).map(x=>x.value);c.eat('contribution','contributions','attribution');
      if(m.metric==='BALANCE')stop('Driver attribution cannot be subtracted from a closing balance.','exclusion','UNSUPPORTED_MODIFIER');
      if(m.driver)stop('A named-driver ranking with driver exclusions has no reviewed combined basis.','exclusion','UNSUPPORTED_MODIFIER');
      hasNewRole=true;c.mark(before,'DRIVER_EXCLUSION',result.excludedDrivers);continue;
    }
    if(after)stop('After excluding needs a named driver, not a filter predicate.','exclusion');
    if(excluding){if(target(c)!==dimension)stop('The filter target must equal the ranking target.','filterTarget','AMBIGUOUS_SCOPE');}
    c.require('with','filter');c.require('rwa','filterMeasure');c.eat('balance');
    const bound=c.atom('BOUND','RWA balance threshold');
    if(bound.value.unit!=='absolute')stop('The balance filter needs a money amount, not a percentage.','filterMeasure','INVALID_UNIT');
    if(result.condition)stop('Use one numeric bound; multiple bounds are not supported.','filter','UNSUPPORTED_MODIFIER');
    if(bound.value.negated)stop('Do not combine nested numeric negation with a balance filter.','filter','AMBIGUOUS_NEGATION');
    result.condition={...clone(bound.value),metric:'BALANCE',op:excluding?inverse[bound.value.op]:bound.value.op,
      negated:excluding,negationSpan:excluding?{start:c.tokens[before].start,end:bound.start,text:text.slice(c.tokens[before].start,bound.start)}:null};
    if(excluding){result.condition.start=c.tokens[before].start;result.condition.raw=text.slice(result.condition.start,bound.end);result.condition.text=result.condition.raw;}
    hasNewRole=true;c.mark(before,'BALANCE_FILTER',{target:dimension,metric:'BALANCE',op:result.condition.op,canonicalValue:result.condition.canonicalValue,unit:'absolute',excludedPredicate:excluding});
  }
  c.end();if(!hasNewRole&&!m.driver)return null;
  if(!result.period&&slots.period)stop('The reporting period was not attached to a supported clause.','period');
  if(!m.rwa&&!result.condition)stop('Use explicit RWA wording with a new ranking.','rankingMeasure');
  result.ledger=c.ledger;result.tokens=c.tokens;result.operations=['RANK',...(result.condition?['FILTER_BALANCE']:[]),...(result.excludedDrivers.length?['EXCLUDE_DRIVER_ATTRIBUTION']:[])];
  return result;
}

/** All replacements are collected before the existing context projector is called once. */
export function parseCompoundContext(text,lex,slots,maxClauses){
  const c=new Cursor(meaningTokens(text,slots),text);c.eat('please');
  if(c.eat('do'))c.require('the','context');
  if(!c.eat('same'))return null;
  if(!c.eat('analysis','report'))return null;
  const result={shape:'COMPOUND_CONTEXT',subject:null,period:null,excludedDrivers:[],includedDrivers:[],operations:[],ledger:[]};
  c.mark(0,'CONTEXT_BASE','LAST_SUCCESSFUL_EXECUTION');let clauses=0,driverClause=false;
  while(c.peek()&&!c.word('.','?','!')){
    c.eat(',');c.eat('but');const before=c.i;
    if(++clauses>maxClauses)stop('Too many context changes; split the request.','clause','SEMANTIC_PLAN_LIMIT');
    if(c.eat('for')){
      if(result.subject)stop('Only one replacement group is supported.','target','AMBIGUOUS_SCOPE');
      const subject=c.atom('NAME','authorised replacement group');if(subject.value.kind!=='GROUP')stop('This compound scope replacement currently requires a group ID or name.','target','UNSUPPORTED_MODIFIER');
      result.subject=subject.value;result.operations.push('REPLACE_SCOPE');c.mark(before,'REPLACE_SCOPE',subject.value);continue;
    }
    if(c.eat('in','during')){
      if(result.period)stop('Only one replacement month is supported.','period','AMBIGUOUS_PERIOD');
      result.period=clone(month(c,slots).value);result.operations.push('REPLACE_PERIOD');c.mark(before,'REPLACE_PERIOD',result.period);continue;
    }
    const op=c.eat('include','including','exclude','excluding','without');
    if(!op)stop('Change the group with “for”, the month with “in”, or explicitly include/exclude drivers.','context');
    if(driverClause)stop('Use one include or exclude operation, not both.','exclusion','AMBIGUOUS_RELATION');driverClause=true;
    const include=op.text.startsWith('in'),drivers=driverList(c).map(x=>x.value);
    result[include?'includedDrivers':'excludedDrivers']=drivers;result.operations.push(include?'INCLUDE':'EXCLUDE');
    if(c.eat('this'))c.require('time','context');c.mark(before,include?'INCLUDE_DRIVER':'EXCLUDE_DRIVER',drivers);
  }
  c.end();if(!result.operations.length)stop('Specify which group, month, or driver condition should change.','context','AMBIGUOUS_CONTEXT');
  if(slots.topN||slots.threshold||slots.references.length)stop('Ranking limits, numeric filters and result references are not compound replacements.','context');
  result.ledger=c.ledger;result.tokens=c.tokens;return result;
}

/** Ranked-result reference plus optional month replacement. Uses the existing
 * FOCUS_REFERENCE handler; it never copies result amounts or widens scope. */
export function parseReferenceContext(text,lex,slots,maxClauses){
  const c=new Cursor(meaningTokens(text,slots),text);c.eat('please');
  if(!c.eat('what','how'))return null;
  c.require('about','reference');c.eat('the');
  const ref=c.atom('REF','ranked result reference');
  const result={shape:'REFERENCE_CONTEXT',reference:ref.value,period:null,operations:['FOCUS_REFERENCE'],ledger:[]};
  c.mark(0,'RESULT_REFERENCE',ref.value);let clauses=0;
  while(c.peek()&&!c.word('.','?','!')){
    c.eat(',');c.eat('but');const before=c.i;
    if(++clauses>maxClauses)stop('Too many reference modifiers; split the request.','clause','SEMANTIC_PLAN_LIMIT');
    if(c.eat('in','during','for')){
      if(result.period)stop('Specify one replacement month.','period','AMBIGUOUS_PERIOD');
      result.period=clone(month(c,slots).value);result.operations.push('REPLACE_PERIOD');c.mark(before,'REPLACE_PERIOD',result.period);continue;
    }
    stop('After a ranked-result reference, only one explicit reporting month is supported in this compound form.','context');
  }
  c.end();
  if(slots.topN||slots.threshold||slots.names.length||slots.drivers.length)stop('Do not mix a ranked-result reference with a new named scope, driver, ranking limit or threshold in this form.','context');
  result.ledger=c.ledger;result.tokens=c.tokens;return result;
}
