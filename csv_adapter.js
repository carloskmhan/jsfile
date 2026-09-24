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
function aliases(x,label){
  if(x===undefined||x==='')return [];
  const a=typeof x==='string'?JSON.parse(x):x;
  if(!Array.isArray(a)||a.some(v=>typeof v!=='string'))throw new Error(`${label}: aliases must be a JSON string array`);
  return a;
}
function number(x,label){if(typeof x!=='number'||!Number.isFinite(x))throw new Error(`${label}: expected a finite JSON number`);return x;}
export function expandCsvRows(clients){
  if(!Array.isArray(clients)||!clients.length)throw new Error('No authorized client rows supplied');
  const rows=[], groupAliases=Object.create(null),entityAliases=Object.create(null),seenIds=new Set(),seenNames=new Set();
  for(const [i,c] of clients.entries()){
    for(const key of ['client_group_name','client_group_id','group_location','rwa_json'])
      if(c[key]===undefined||c[key]===null||String(c[key]).trim()==='')throw new Error(`Client row ${i+1}: missing ${key}`);
    const name=String(c.client_group_name).trim(),id=String(c.client_group_id).trim();
    if(seenIds.has(id)||seenNames.has(name.toLowerCase()))throw new Error('Expected one CSV row per group with unique group ID and name');
    seenIds.add(id);seenNames.add(name.toLowerCase());
    let data;try{data=typeof c.rwa_json==='string'?JSON.parse(c.rwa_json):c.rwa_json;}catch(e){throw new Error(`${id}: invalid rwa_json: ${e.message}`);}
    if(!object(data)||!Array.isArray(data.entities)||!data.entities.length)throw new Error(`${id}: entities must be a nonempty array`);
    groupAliases[name]=[id,...aliases(c.group_aliases,id)];
    const entityIds=new Set(),entityNames=new Set();
    for(const e of data.entities){
      if(!e.entity_id||!e.entity_name||!Array.isArray(e.months)||!e.months.length)throw new Error(`${id}: entity requires ID, name, and months`);
      if(entityIds.has(e.entity_id)||entityNames.has(e.entity_name.toLowerCase()))throw new Error(`${id}: duplicate entity ID/name`);
      entityIds.add(e.entity_id);entityNames.add(e.entity_name.toLowerCase());
      entityAliases[e.entity_name]=[...new Set([...(entityAliases[e.entity_name]||[]),...aliases(e.aliases,e.entity_id)])];
      const months=new Set();
      for(const m of e.months){
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))throw new Error(`${id}: invalid YYYY-MM month`);
        const grain=JSON.stringify([m.month,m.product||'',m.booking_location||'',m.record_id||'']);
        if(months.has(grain))throw new Error(`${id}/${e.entity_id}: duplicate record grain; aggregate upstream or supply record_id`);
        months.add(grain);
        const prev=number(m.rwa_prev,'rwa_prev'),curr=number(m.rwa_curr,'rwa_curr');
        if(prev<0||curr<0)throw new Error('RWA balances must be nonnegative');
        if(!object(m.drivers))throw new Error(`${id}: drivers must be an object`);
        const drivers=Object.create(null);
        for(const [d,v] of Object.entries(m.drivers)){
          if(['__proto__','constructor','prototype'].includes(d))throw new Error('Invalid driver name');
          drivers[d]=number(v,d);
        }
        rows.push({client_group:name,client_group_id:id,group_location:String(c.group_location).trim(),entity:e.entity_name,entity_id:e.entity_id,month:m.month,rwa_prev:prev,rwa_curr:curr,drivers,...Object.fromEntries(['product','booking_location','record_id'].filter(k=>m[k]!=null).map(k=>[k,String(m[k])]))});
      }
    }
  }
  return {rows,groupAliases,entityAliases};
}
export function loadClientCsv(text){return expandCsvRows(parseCsv(text));}
