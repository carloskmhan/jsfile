import {parseCsv,expandCsvRows} from './csv_adapter.js';
import {localText} from './network.js';
/** Retains original v2 classic-script and JSON-column contract. No embedded credentials. */
export function tableauRowToClient(row,group,fields,options={}){
 if(String(row[fields.id])!==group.client_group_id)throw new Error('Returned group ID differs from requested ID.');
 if(String(row[fields.name])!==group.client_group_name)throw new Error('Group name differs from catalog; update the catalog.');
 const raw=row[fields.json];if(typeof raw==='string'&&raw.length>(options.maxJsonBytes||5000000))throw new Error('Group JSON exceeds limit.');
 const payload=typeof raw==='string'?JSON.parse(raw.replace(/^\uFEFF/,'')):raw;
 if(!Array.isArray(payload?.rows)||!payload.rows.length)throw new Error('json_data.rows must be nonempty.');
 if(payload.rows.length>(options.maxDataRows||100000))throw new Error('Too many entity rows.');
 const entities=new Map();
 for(const r of payload.rows){
  if(!r.entity_id||!r.entity)throw new Error('Each JSON row needs entity_id and entity.');
  const id=String(r.entity_id);if(!entities.has(id))entities.set(id,{entity_id:id,entity_name:r.entity,aliases:payload.entityAliases?.[r.entity]||r.entity_aliases||[],months:[]});
  const e=entities.get(id);if(e.entity_name!==r.entity)throw new Error('Conflicting entity names.');
  e.months.push({month:r.month,rwa_prev:r.rwa_prev,rwa_curr:r.rwa_curr,drivers:r.drivers||{},...Object.fromEntries(['product','booking_location','record_id'].filter(k=>r[k]!=null).map(k=>[k,r[k]]))});
 }
 const client={client_group_id:group.client_group_id,client_group_name:group.client_group_name,group_location:row[fields.location],group_aliases:group.aliases,rwa_json:{entities:[...entities.values()]}};
 expandCsvRows([client]);return client;
}
export async function readWorksheetRows(worksheet,config){
 if(typeof worksheet.getSummaryDataAsync!=='function')throw new Error('Tableau v2 getSummaryDataAsync unavailable.');
 const table=await worksheet.getSummaryDataAsync({maxRows:0,ignoreAliases:true,ignoreSelection:true});
 const columns=table.getColumns(),data=table.getData();
 if(table.getTotalRowCount()!==data.length||table.getIsTotalRowCountLimited?.())throw new Error('Incomplete/truncated Tableau response. No analysis performed.');
 if(data.length>(config.maxPortfolioGroups||500))throw new Error('Returned group count exceeds configured limit.');
 const names=columns.map(c=>c.getFieldName());if(new Set(names).size!==names.length)throw new Error('Duplicate Tableau columns.');
 for(const name of Object.values(config.fields))if(!names.includes(name))throw new Error('Missing worksheet field: '+name);
 return data.map(cells=>Object.fromEntries(columns.map(c=>[c.getFieldName(),cells[c.getIndex()]?.value])));
}
export async function readWorksheetGroup(worksheet,group,config){
 await worksheet.applyFilterAsync(config.filterField,[config.filterBy==='name'?group.client_group_name:group.client_group_id],'replace');
 const rows=await readWorksheetRows(worksheet,config);if(rows.length!==1)throw new Error('Expected exactly one authorised group row; got '+rows.length);
 return tableauRowToClient(rows[0],group,config.fields,config);
}
let apiLoading=null;
export function loadTableauV2(url,timeoutMs=60000){
 if(typeof globalThis.tableau?.Viz==='function')return Promise.resolve(globalThis.tableau);
 if(apiLoading)return apiLoading;
 apiLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=url;script.async=true;script.dataset.rwaTableauApi='v2';
  // No type=module, crossorigin, fetch(scriptURL) or dynamic import for the Tableau library.
  let settled=false;
  const done=error=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve(globalThis.tableau);};
  const timer=setTimeout(()=>done(new Error('Tableau API load timed out.')),timeoutMs);
  script.onload=()=>done(typeof globalThis.tableau?.Viz==='function'?null:new Error('Use a Tableau v2 classic script that exposes tableau.Viz.'));
  script.onerror=()=>done(new Error('Tableau script load failed. Check URL, sign-in and CSP.'));document.head.append(script);
 }).catch(e=>{apiLoading=null;throw e;});return apiLoading;
}
export async function createProvider(config,host,catalog){
 if(config.mode==='sample'){
  const rows=parseCsv(await localText(config.sampleCsvUrl));
  const convert=r=>{const g=catalog.find(g=>g.client_group_id===String(r[config.fields.id]));if(!g)throw new Error('Sample group missing from catalog.');return tableauRowToClient(r,g,config.fields,config);};
  return {async load(group){const found=rows.filter(r=>String(r[config.fields.id])===group.client_group_id);if(found.length!==1)throw new Error('No unique sample group.');return convert(found[0]);},async loadPortfolio(){return rows.map(convert);},onContextChanged(){},close(){}};
 }
 if(config.mode!=='tableau'||!['id','name'].includes(config.filterBy))throw new Error('Invalid provider configuration.');
 const origin=new URL(config.tableauUrl).origin;
 const api=await loadTableauV2(config.apiUrl||origin+'/javascripts/api/tableau-2.8.2.min.js',config.timeoutMs||60000);
 let viz,busy=false,listener=()=>{};
 await new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>{if(done)return;done=true;viz?.dispose();reject(new Error('Tableau initialization timed out. Verify SSO and embedding permissions.'));},config.timeoutMs||60000);try{viz=new api.Viz(host,config.tableauUrl,{hideTabs:true,hideToolbar:true,width:'100%',height:'520px',onFirstInteractive(){if(done)return;done=true;clearTimeout(timer);resolve();}});}catch(e){done=true;clearTimeout(timer);reject(e);}});
 function sheet(){const active=viz.getWorkbook().getActiveSheet();const type=active.getSheetType();const w=type==='worksheet'?(active.getName()===config.worksheetName?active:null):type==='dashboard'?active.getWorksheets().find(w=>w.getName()===config.worksheetName):null;if(!w)throw new Error('Worksheet not found: '+config.worksheetName);return w;}
 const timed=async fn=>{busy=true;let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tableau data refresh timed out.')),config.timeoutMs||60000);})]);}finally{clearTimeout(timer);busy=false;}};
 const invalidate=()=>{if(!busy)listener();};
 if(viz.addEventListener&&api.TableauEventName)for(const key of ['FILTER_CHANGE','TAB_SWITCH'])if(api.TableauEventName[key])viz.addEventListener(api.TableauEventName[key],invalidate);
 return {
  load:group=>timed(()=>readWorksheetGroup(sheet(),group,config)),
  loadPortfolio:()=>timed(async()=>{
   if(!config.allowPortfolioQueries)throw new Error('Portfolio queries are disabled in live mode. Enable allowPortfolioQueries only after approving the authorised data scope.');
   const w=sheet();await w.clearFilterAsync(config.filterField); // Explicit user-requested portfolio view. Other filters remain.
   const rows=await readWorksheetRows(w,config);if(!rows.length)throw new Error('No authorised portfolio rows.');
   const ids=new Set();return rows.map(r=>{const id=String(r[config.fields.id]);if(ids.has(id))throw new Error('Duplicate group rows in portfolio response.');ids.add(id);const g=catalog.find(g=>g.client_group_id===id);if(!g)throw new Error('Authorised group is missing from catalog; refresh catalog.');return tableauRowToClient(r,g,config.fields,config);});
  }),onContextChanged(fn){listener=fn;},close(){viz.dispose();}
 };
}
