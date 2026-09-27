/** RFC-style CSV reader and Tableau-authorized rows → v3/v4 engine data.
 * Access control must happen BEFORE these rows reach the browser.
 */
export function parseCsv(text) {
  text=String(text).replace(/^\uFEFF/, '');
  const records=[]; let row=[],cell='',state='start';
  const endCell=()=>{row.push(cell);cell='';state='start';};
  const endRow=()=>{endCell();if(row.some(v=>v!==''))records.push(row);row=[];};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(state==='quoted'){
      if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else state='closed';}
      else cell+=c;
    }else if(c===',')endCell();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
    else if(c==='"'&&state==='start')state='quoted';
    else {if(state==='closed'||c==='"')throw new Error('Malformed CSV quoting');cell+=c;state='plain';}
  }
  if(state==='quoted')throw new Error('Unclosed CSV quoted field');
  if(cell!==''||row.length||state==='closed')endRow();
  if(!records.length)throw new Error('Empty CSV');
  const headers=records.shift().map(x=>x.trim());
  if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw new Error('Empty/duplicate CSV headers');
  return records.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV row ${i+2}: expected ${headers.length} columns, got ${r.length}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const forbidden=new Set(['__proto__','constructor','prototype']);
export function isDerivedPrevious(row){return typeof row?.attributes?.rwa_prev_source==='string'&&row.attributes.rwa_prev_source.startsWith('derived_from_current_rwa_minus_');}
function number(x,label){if(typeof x!=='number'||!Number.isFinite(x))throw new Error(`${label}: expected a finite JSON number`);return x;}
export function safeAttributes(value={}) {
  if(!object(value))throw new Error('attributes must be an object');
  const out={};
  for(const k of ['cg','cg_curr','ead_curr','scorecard_curr','rwa_prev_source','duplicate_attribution_rows_ignored']){
    if(!Object.hasOwn(value,k))continue;
    const v=value[k];if(v!==null&&!['string','number'].includes(typeof v))throw new Error('Invalid attribute: '+k);
    if(typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>1024)throw new Error('Invalid attribute value: '+k);
    out[k]=v;
  }
  return out;
}
export function expandCsvRows(clients){
  if(!Array.isArray(clients)||!clients.length)throw new Error('No authorised client rows supplied');
  const rows=[],groupAliases=Object.create(null),entityAliases=Object.create(null),seenIds=new Set();
  for(const [i,c] of clients.entries()){
    for(const key of ['client_group_name','client_group_id','rwa_json'])if(c[key]===undefined||c[key]===null||String(c[key]).trim()==='')throw new Error(`Client row ${i+1}: missing ${key}`);
    if(typeof c.client_group_id!=='string')throw new Error('Group IDs must be strings.');
    const name=String(c.client_group_name).trim(),id=c.client_group_id.trim();
    if(seenIds.has(id))throw new Error('Expected one CSV row per unique group ID (duplicate names are allowed).');seenIds.add(id);
    const data=typeof c.rwa_json==='string'?JSON.parse(c.rwa_json):c.rwa_json;
    if(!object(data)||!Array.isArray(data.entities)||!data.entities.length)throw new Error(`${id}: entities must be a nonempty array`);
    const entityIds=new Set();
    for(const e of data.entities){
      if(typeof e.entity_id!=='string'||!e.entity_id||typeof e.entity_name!=='string'||!e.entity_name||!Array.isArray(e.months)||!e.months.length)throw new Error(`${id}: entity requires string ID, display name, and months`);
      if(entityIds.has(e.entity_id))throw new Error(`${id}: duplicate entity ID; duplicate display names are allowed.`);entityIds.add(e.entity_id);
      const months=new Set();
      for(const m of e.months){
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))throw new Error(`${id}: invalid YYYY-MM month`);
        const grain=JSON.stringify([m.month,m.product||'',m.booking_location||'',m.record_id||'']);
        if(months.has(grain))throw new Error(`${id}/${e.entity_id}: duplicate record grain; aggregate upstream or supply record_id`);months.add(grain);
        const attrs=safeAttributes(m.attributes||{}),prev=number(m.rwa_prev,'rwa_prev'),curr=number(m.rwa_curr,'rwa_curr');
        if(curr<0||prev<0&&!isDerivedPrevious({attributes:attrs}))throw new Error('Reported RWA balances must be nonnegative; a negative derived comparison basis must be explicitly tagged.');
        if(!object(m.drivers))throw new Error(`${id}: drivers must be an object`);
        const drivers=Object.create(null);
        for(const [d,v]of Object.entries(m.drivers)){
          if(!d.trim()||d.length>1000||forbidden.has(d)||/[\u0000-\u001f\u007f]/.test(d))throw new Error('Invalid driver name');
          drivers[d]=number(v,d);
        }
        const families=Object.create(null);
        if(m.driver_groups!==undefined){
          if(!object(m.driver_groups))throw new Error('driver_groups must map exact detail labels to approved family labels.');
          for(const [d,f]of Object.entries(m.driver_groups)){
            if(!Object.hasOwn(drivers,d)||typeof f!=='string'||!f.trim()||f.length>512||forbidden.has(f))throw new Error('Invalid driver family mapping.');
            families[d]=f;
          }
        }
        rows.push({client_group:name,client_group_id:id,group_location:String(c.group_location||'NOT_PROVIDED'),entity:e.entity_name,entity_id:e.entity_id,month:m.month,rwa_prev:prev,rwa_curr:curr,drivers,attributes:attrs,driver_groups:families,
          ...Object.fromEntries(['product','booking_location','record_id'].filter(k=>m[k]!=null).map(k=>[k,String(m[k])]))});
      }
    }
  }
  return {rows,groupAliases,entityAliases};
}
export function loadClientCsv(text){return expandCsvRows(parseCsv(text));}
