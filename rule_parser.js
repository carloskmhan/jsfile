/**
 * Fixed command-template gate. Every word must belong to a complete reviewed template
 * and zero or more explicitly enumerated tail clauses. No semantic score, knowledge
 * graph, learned classifier, rule chaining, or arbitrary expression execution.
 */
import {FixedFieldsParser, DRIVER_ALIASES, norm, findNames, aliasRe, catalogMentions, portfolioRequest, monthRange, shiftMonth} from './command_fields.js';
export {norm,findNames,aliasRe,catalogMentions,portfolioRequest,monthRange,shiftMonth,DRIVER_ALIASES};
export const RULE_VERSION='3.0.0-review';
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const uniq=a=>[...new Set(a)];
const words=s=>esc(s).replace(/ /g,'\\s+');
const alternative=a=>'(?:'+uniq(a).sort((a,b)=>b.length-a.length).map(words).join('|')+')';
const ACTIONS=new Set(['GROUP_ROOT_CAUSE','ENTITY_DRIVER','TOP_ENTITY','TOP_CLIENTS','MAIN_DRIVER','DRIVER_CONTRIBUTION','DRIVER_CHECK','ENTITY_CONTRIBUTION','CONCENTRATION','DATA_QUALITY','OFFSETS','COMPARE','TREND','PEAK_MONTH']);
const SLOTS=new Set(['scope','other_scope','entity','driver','dimension','movement','period','other_period','n']);
const date='(?:20\\d{2}[-/](?:0?[1-9]|1[0-2])|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:[- /](?:20\\d{2}|\\d{2}))?|(?:last|past|recent) (?:[1-9]\\d?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty) months?|(?:last|previous|prior|latest|current|this) month|(?:last|previous) quarter|q[1-4](?: 20\\d{2})?|ytd|year to date|3m|6m|12m)';
const MOVEMENTS=['spike','increase','rise','jump','change','movement','decrease','decline','fall','drop','reduction','growth','higher','up','down'];
const REFS=['the group','this group','group','it','its','this','the entity','this entity','that entity','that subsidiary','the first one','the second one','the third one','the fourth one','the fifth one','the largest one','the next one','next entity','one after that'];
const clone=x=>JSON.parse(JSON.stringify(x));
export function validateCommands(config){
 if(!config||config.schemaVersion!==1||!Array.isArray(config.patterns)||config.patterns.length>1000)throw new Error('Invalid command registry; schemaVersion 1, at most 1000 templates.');
 const ids=new Set(),seen=new Map();
 for(const p of config.patterns){
  if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.enabled!=='boolean')throw new Error('Command IDs must be unique and enabled must be boolean.');ids.add(p.id);
  for(const field of ['questionPattern','canonicalPattern']){
   if(typeof p[field]!=='string'||p[field].length>300||!p[field].trim()||/[<>`\n\r]/.test(p[field]))throw new Error('Invalid command template.');
   const slots=[...p[field].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);
   if(slots.some(s=>!SLOTS.has(s))||/[{}]/.test(p[field].replace(/\{[^}]+\}/g,'')))throw new Error('Unsupported template slot; arbitrary regex/code is not supported.');
   if(field==='questionPattern'&&uniq(slots).length!==slots.length)throw new Error('Use other_scope / other_period for a second slot.');
  }
  const input=[...p.questionPattern.matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);
  const output=[...p.canonicalPattern.matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);
  if(output.some(x=>!input.includes(x))||input.some(x=>!output.includes(x)))throw new Error('Every captured slot must be preserved in the canonical command.');
  if(p.enabled){const key=norm(p.questionPattern);if(seen.has(key)&&seen.get(key)!==norm(p.canonicalPattern))throw new Error('Conflicting enabled command templates.');seen.set(key,norm(p.canonicalPattern));}
 }
 if(!Array.isArray(config.phraseAliases)||config.phraseAliases.length>500)throw new Error('Invalid phrase aliases.');
 const aliases=new Set();for(const a of config.phraseAliases){if(!a||typeof a.from!=='string'||typeof a.to!=='string'||!a.from.trim()||!a.to.trim()||a.from.length>128||a.to.length>128||/[{}<>`\n\r]/.test(a.from+a.to)||aliases.has(norm(a.from)))throw new Error('Invalid or duplicate phrase alias.');aliases.add(norm(a.from));}
 if(!Array.isArray(config.prefixes)||config.prefixes.some(p=>typeof p!=='string'||!p.trim()||p.length>100||/[{}<>`]/.test(p)))throw new Error('Invalid courtesy prefixes.');
 return clone(config);
}
export class RuleParser{
 constructor(options={}){
  this.options=options;this.registry=options.commandPatterns?validateCommands(options.commandPatterns):null;
  this.fields=new FixedFieldsParser(options);this.cache=null;
 }
 examples(){return this.registry?.patterns.filter(x=>x.enabled&&!/[{}]/.test(x.questionPattern)).slice(0,8).map(x=>x.questionPattern)||[];}
 parse(question,rows,context={},state={}){
  const failure=(message)=>({ok:false,status:'clarify',message,choices:['Explain the RWA movement','Top 3 entities','Do the drivers reconcile?'],trace:['fixed-command-gate-'+RULE_VERSION]});
  if(!this.registry)return failure('Command registry is missing. No fallback parser is enabled.');
  let q=norm(question);if(!q||q.length>1000||/[<>`{}]|zzscope\d+zz/.test(q))return failure('Use a plain-text RWA command of 1–1,000 characters.');
  if(/\b(what if|forecast|predict|recommend|should we|optimise|optimize|simulate|simulation|next month|next year|sell|buy|approve|delete|update|execute|risk density|rorwa|income|revenue|profit|correlation)\b/.test(q))return failure('Only predefined historical RWA reports are supported; no forecasting, recommendations, reasoning or counterfactual recalculation.');
  // Direct catalog lookup, not entity inference. Ambiguous matches are rejected below.
  const items=[],gs=new Set(),es=new Set();
  for(const r of rows){if(!gs.has(r.client_group)){gs.add(r.client_group);items.push({key:r.client_group_id||r.client_group,name:r.client_group,kind:'group',aliases:[r.client_group_id||'',r.client_group,...(this.options.groupAliases?.[r.client_group]||[])]});}
   const key=r.client_group+'\0'+(r.entity_id||r.entity);if(!es.has(key)){es.add(key);items.push({key,name:r.entity,kind:'entity',aliases:[r.entity_id||'',r.entity,...(this.options.entityAliases?.[r.entity]||[])]});}}
  const found=findNames(q,items);for(const n of found)if(found.some(x=>x.start===n.start&&x.end===n.end&&x.key!==n.key&&x.kind===n.kind))return failure('The name is ambiguous; use the full group/entity ID.');
  const markers=[];for(const n of [...found].sort((a,b)=>b.start-a.start)){if(markers.some(m=>m.start===n.start&&m.end===n.end))continue;const marker='zzscope'+markers.length+'zz';markers.push({...n,marker});q=q.slice(0,n.start)+marker+q.slice(n.end);}
  const restore=s=>{for(const m of markers)s=s.replaceAll(m.marker,m.name);return s;};
  q=q.replace(/\b(zzscope\d+zz)'s\b/g,'$1').replace(/\b(group|entity|it)'s\b/g,'$1').replace(/[?.!]+$/,'').trim();
  const trace=[];
  for(const p of [...this.registry.prefixes].sort((a,b)=>b.length-a.length)){const re=new RegExp('^'+words(norm(p))+'\\s+','u');if(re.test(q)){trace.push('prefix:'+p);q=q.replace(re,'');break;}}
  // One literal replacement pass. A replacement cannot trigger another alias chain.
  const aliases=[...this.registry.phraseAliases].sort((a,b)=>b.from.length-a.from.length);
  if(aliases.length){const rx=new RegExp('(?<![\\p{L}\\p{N}])('+aliases.map(a=>words(norm(a.from))).join('|')+')(?![\\p{L}\\p{N}])','gu');q=q.replace(rx,text=>{const a=aliases.find(a=>norm(a.from)===norm(text));trace.push('literal:'+a.from+' -> '+a.to);return norm(a.to);});}
  const scope=alternative([...markers.map(x=>x.marker),...REFS]);
  const entity=alternative([...markers.filter(x=>x.kind==='entity').map(x=>x.marker),'this entity','that entity','the entity','the first one','the second one','the third one','the fourth one','the fifth one','the largest one','the next one','next entity','one after that']);
  const drivers=uniq([...Object.entries(DRIVER_ALIASES).flatMap(([k,a])=>[k,...a]),...rows.flatMap(r=>Object.keys(r.drivers))].map(norm));
  const driver=alternative(drivers);
  const slots={scope,other_scope:scope,entity,driver,dimension:'(?:entities|entity|groups|group|client groups|clients|products|product|locations|location|bookings)',movement:alternative(MOVEMENTS),period:date,other_period:date,n:'(?:[1-9]\\d?|one|two|three|four|five|six|seven|eight|nine|ten|twenty)'};
  // Preserve boundary spaces around slots while compiling literal pieces.
  const templateRegex=p=>new RegExp('^'+p.split(/(\{[^}]+\})/).map(t=>/^\{/.test(t)?'(?<'+t.slice(1,-1)+'>'+slots[t.slice(1,-1)]+')':esc(t.toLowerCase()).replace(/ +/g,'\\s+')).join('')+'$','u');
  let base=q,suffix=[],kinds=[];
  const suffixes=[
   {kind:'style',re:/\s+(in one sentence|briefly|in detail)$/,out:m=>m[1]==='in detail'?'more detail':m[1]},
   {kind:'inclusion',re:new RegExp('\\s+(?:including|include|restore|put back|add back) ('+driver+'|'+entity+')(?: back)?$','u'),out:m=>'include '+m[1]},
   {kind:'exclusion',re:new RegExp('\\s+(excluding|without|except) ('+driver+'(?: (?:and|,) '+driver+')*|'+entity+')$','u'),out:m=>'excluding '+m[2]},
   {kind:'threshold',re:/\s+(above|below|greater than|less than|at least|at most) (\$?\d+(?:\.\d+)?\s*(?:m|bn|b|million|billion|%))$/,out:m=>m[1]+' '+m[2]},
   {kind:'metric',re:new RegExp('\\s+by (percentage (?:increase|change)|percent(?:age)? growth|(?:closing |current )?rwa balance|rwa (?:increase|change|decrease)|increase|decrease|absolute change|'+driver+')$','u'),out:m=>'by '+m[1]},
   {kind:'period',re:new RegExp('\\s+(in|for|during|over|since) (?:the )?('+date+')$','u'),out:m=>(m[1]==='during'?'in':m[1])+' '+m[2]},
   {kind:'scope',re:new RegExp('\\s+(in|for|within|of) ('+scope+')$','u'),out:m=>'for '+m[2]}
  ];
  // First allow an exact base before stripping suffixes; this preserves "same for May".
  const matches=(s)=>{const all=[];for(const p of this.registry.patterns){if(!p.enabled)continue;const m=templateRegex(norm(p.questionPattern)).exec(s);if(m){let c=p.canonicalPattern;for(const[k,v]of Object.entries(m.groups||{}))c=c.replaceAll('{'+k+'}',v);all.push({id:p.id,canonical:c});}}return all;};
  let hits=matches(base);
  for(let n=0;!hits.length&&n<8;n++){
   let taken=false;for(const s of suffixes){const m=s.re.exec(base);if(!m)continue;if(kinds.includes(s.kind))return failure('A modifier is repeated or contradictory. Use one period, scope, metric, threshold and exclusion clause.');kinds.push(s.kind);suffix.unshift(s.out(m));base=base.slice(0,m.index).trim().replace(/,$/,'');taken=true;break;}if(!taken)break;hits=matches(base);
  }
  if(!hits.length)return failure('No complete registered command matches this wording. No words or conditions were silently ignored. Use an example or add a reviewed command pattern.');
  const outputs=uniq(hits.map(x=>restore(x.canonical+' '+suffix.join(' ')).trim()));
  if(outputs.length>1)return failure('More than one command template matches with different instructions. Refine the command; no operation was selected.');
  const canonical=outputs[0];
  const originalFollow=!!state.action&&/^(and\b|what about\b|how about\b|same\b|why\b|what drove\b|what caused\b|shorter$|briefly$|more detail$|in one sentence$|compare (?:that|it|this) with\b|rank (?:those|them) by\b|which of those\b|back to\b|clear exclusions$|remove all exclusions$|reset exclusions$|original basis$|include\b|exclude\b)/.test(q);
  const fieldContext=originalFollow?{...context,selectedClientGroup:state.group||context.selectedClientGroup,selectedEntity:state.entity||null,selectedMonth:state.anchorMonth||context.selectedMonth}:context;
  const parsed=this.fields.parse(canonical,rows,fieldContext,state);
  if(!parsed.ok)return {...parsed,canonicalQuestion:canonical,matchedTemplates:hits.map(x=>x.id)};
  const p=parsed.plan;
  if(/\b(those|them|of those|among those)\b/.test(q)&&state.rankDimension==='ENTITY'&&state.ranked?.length){p.candidateEntities=state.ranked.map(x=>x.entity).filter(Boolean);p.trace=[...(p.trace||[]),'prior-ranked-subset'];}
  if(!ACTIONS.has(p.action))return failure('The matched operation is not in the fixed execution allowlist.');
  if(p.driver&&['GROUP_ROOT_CAUSE','ENTITY_DRIVER'].includes(p.action))return failure('Specify driver contribution, driver check, or an overall breakdown. A named driver must not be silently ignored.');
  if(p.condition&&!['TOP_ENTITY','TOP_CLIENTS'].includes(p.action))return failure('Amount thresholds are supported for rankings only.');
  if(kinds.includes('metric')&&!['TOP_ENTITY','TOP_CLIENTS','PEAK_MONTH','COMPARE'].includes(p.action))return failure('This ranking/metric clause is not applicable to that operation.');
  p.commandId=hits[0].id;p.canonicalQuestion=canonical;p.registryVersion=this.registry.version;p.trace=['fixed-command-gate-'+RULE_VERSION,...trace,'template:'+hits[0].id,...p.trace];
  return {ok:true,plan:p,canonicalQuestion:canonical,matchedTemplates:hits.map(x=>x.id),requiresConfirmation:true};
 }
}
