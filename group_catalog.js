const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function validateCatalog(data){
 if(!Array.isArray(data.groups)||!data.groups.length)throw new Error('Catalog groups required');
 const ids=new Set(),names=new Set();
 for(const g of data.groups){
  if(typeof g.client_group_id!=='string'||!g.client_group_id.trim()||typeof g.client_group_name!=='string'||!g.client_group_name.trim()||!Array.isArray(g.aliases)||g.aliases.some(a=>typeof a!=='string'))throw new Error('Invalid group catalog');
  if(ids.has(g.client_group_id)||names.has(normalize(g.client_group_name)))throw new Error('Duplicate group ID/name unsupported');
  ids.add(g.client_group_id);names.add(normalize(g.client_group_name));
 }
 return data.groups;
}
export function resolveGroup(q,groups){
 const text=' '+normalize(q)+' ';
 const matches=groups.filter(g=>[g.client_group_id,g.client_group_name,...g.aliases].some(a=>normalize(a)&&text.includes(' '+normalize(a)+' ')));
 if(matches.length>1)throw new Error('More than one group matched. Ask about one group using its full name or ID.');
 return matches[0]||null;
}
export function isGroupOnly(q,g){return[g.client_group_id,g.client_group_name,...g.aliases].some(a=>normalize(a)===normalize(q));}
