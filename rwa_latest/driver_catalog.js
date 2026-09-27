/** Driver labels are data, not customer-independent NLP rules. No inferred family map. */
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function driverCatalog(rows){
  const byLabel=new Map(),families=new Map();
  for(const row of rows){
    for(const label of Object.keys(row.drivers||{})){
      const k=norm(label);if(byLabel.has(k)&&byLabel.get(k).label!==label)throw new Error('Conflicting driver labels differing only by normalisation. Standardise the source.');
      byLabel.set(k,{label,kind:'detail'});
    }
    for(const [detail,family]of Object.entries(row.driver_groups||{})){
      if(families.has(detail)&&families.get(detail)!==family)throw new Error('One detail driver has conflicting family mappings in this data scope.');families.set(detail,family);
    }
  }
  for(const family of new Set(families.values())){
    if(byLabel.has(norm(family)))throw new Error('A driver family label is also a monetary leaf. Do not mix parent totals and details in drivers.');
    byLabel.set(norm(family),{label:family,kind:'family'});
  }
  return {labels:[...byLabel.values()],families};
}
/** Maps a requested exact leaf/family to leaves, preserving missing-as-unknown. */
export function driverSelection(rows,request){
  const cat=driverCatalog(rows),key=norm(request),hit=cat.labels.find(x=>norm(x.label)===key);
  if(!hit)return {found:false,request,leaves:[]};
  const leaves=hit.kind==='detail'?[hit.label]:[...cat.families].filter(([,f])=>norm(f)===key).map(([d])=>d);
  if(hit.kind==='family'&&rows.some(r=>Object.keys(r.drivers).some(d=>!Object.hasOwn(r.driver_groups||{},d))))throw new Error('Family reporting requires complete explicit detail-to-family mapping on all selected rows; missing mappings are not inferred.');
  return {found:true,request:hit.label,kind:hit.kind,leaves};
}
