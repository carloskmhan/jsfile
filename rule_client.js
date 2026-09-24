import {RwaQaEngine} from './rwa_engine.js';
import {expandCsvRows} from './csv_adapter.js';
/** In-memory facade replacing MiniLMClient. No Worker, Python, model or training endpoint. */
export class RuleClient {
 constructor(config={}){this.config=config;this.engine=null;this.state={};this.ready=false;this.pending=null;this.generation=0;}
 reset(){this.state={};this.pending=null;this.engine?.reset();}
 invalidate(){this.ready=false;this.engine=null;this.pending=null;this.generation++;}
 setData(clients,{portfolioComplete=false,source='provided rows'}={}){
  this.invalidate();const d=expandCsvRows(clients);if(d.rows.length>(this.config.maxDataRows||100000))throw new Error('Dataset exceeds configured row limit.');
  const entityAliases={...d.entityAliases};for(const [name,aliases] of Object.entries(this.config.rules?.entityAliases||{})){if(!Array.isArray(aliases)||aliases.some(a=>typeof a!=='string'||a.length>128))throw new Error('Invalid entity alias list.');entityAliases[name]=[...new Set([...(entityAliases[name]||[]),...aliases])];}
  const thresholds=this.config.rules?.concentrationThresholds||{high:0.7,medium:0.4};if(!(thresholds.high>=thresholds.medium&&thresholds.high<=1&&thresholds.medium>=0))throw new Error('Invalid concentration thresholds.');
  this.engine=new RwaQaEngine(d.rows,{...d,entityAliases,commandPatterns:this.config.commandPatterns,concentrationThresholds:thresholds,unit:this.config.unit||'USDm',reconciliationTolerance:this.config.reconciliationTolerance??0.01,portfolioComplete,source,fetchedAt:new Date().toISOString()});
  this.engine.state=this.state;this.ready=true;return {rows:d.rows,clients};
 }
 prepare(q,ctx={}){
  if(!this.ready||!this.engine)throw new Error('No fresh validated data available.');
  this.pending=null;const p=this.engine.parseQuestion(q,ctx);
  if(!p.ok)return {ok:false,status:p.status,answer:p.message,choices:p.choices||[],trace:p.trace};
  const token=globalThis.crypto?.randomUUID?.()||('preview-'+this.generation+'-'+Date.now());
  this.pending={token,q,ctx:JSON.parse(JSON.stringify(ctx)),generation:this.generation,created:Date.now()};
  return {ok:false,status:'preview',answer:'Review this fixed report request, then select Run report.',plan:p.plan,previewToken:token,trace:p.plan.trace};
 }
 cancel(){this.pending=null;}
 confirm(token){
  const pending=this.pending;this.pending=null;
  if(!pending||pending.token!==token||pending.generation!==this.generation||Date.now()-pending.created>120000)throw new Error('This preview expired or the data/context changed. Submit the request again.');
  return this.answer(pending.q,pending.ctx);
 }
 answer(q,ctx={}){if(!this.ready||!this.engine)throw new Error('No fresh validated data available.');const r=this.engine.answer(q,ctx);if(r.ok)this.state=this.engine.state;return r;}
}
