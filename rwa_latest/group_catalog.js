/** Runtime identities come from the authenticated Tableau index, not the rule artifact.
 * An ID is the key. Names are display values and may collide. No persistent storage.
 */
const normal = s => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const caches = new WeakMap();
// Patch 6.0.6-name-tokens: filter ONLY automatically derived name fragments.
// Real full display names and exact system IDs are never rewritten/removed.
// For example, 'ALPHA FOR TRADE' remains a valid complete name, but 'for'
// must NOT be an alias of it. Otherwise the app's '<pending query> for <ID>'
// continuation can falsely match every customer whose name contains FOR.
// This is an explicit token rule, not learned stop words or fuzzy matching.
const GENERIC_NAME_PARTS = new Set((
  'group inc incorporated limited ltd plc corporation corp co holdings holding company companies financial services international bank ' +
  'a an the of and or but nor for from to in on at by as with without into onto upon within across ' +
  'about after before between through throughout during over under per via behalf than ' +
  'this that these those it its our your their is are was were be been being ' +
  'only except including excluding'
).split(' '));
function distinctiveNamePart(token) {
  return token.length >= 3 && /[\p{L}]/u.test(token) && !GENERIC_NAME_PARTS.has(token);
}
export function nameVariants(name) {
  const n = normal(name), result = new Set([String(name).trim()]);
  // Finite display-name shortening, NOT arbitrary acronym inference (e.g. SEC).
  // Shortened names must retain a distinctive part. Real collisions are still
  // resolved by the existing exact-name/ID logic, never by picking the first ID.
  const shortened = n.replace(/(?:\s+(?:group|inc|incorporated|limited|ltd|plc|corporation|corp|co))+$/u, '').trim();
  if (shortened !== n && shortened.length >= 4 && shortened.split(' ').some(distinctiveNamePart)) result.add(shortened);
  for (const token of n.split(' ')) if (distinctiveNamePart(token)) result.add(token);
  return [...result];
}
export function indexRowsToCatalog(rows, fields={id:'client_group_id',name:'client_group_name'}, options={}) {
  if (!Array.isArray(rows)) throw new Error('Group index must return rows.');
  if (rows.length > (options.maxIndexRows ?? 100000)) throw new Error('Group index exceeds maxIndexRows; do not truncate it.');
  const byId = new Map();
  for (const [i,row] of rows.entries()) {
    const rawId=row[fields.id], rawName=row[fields.name];
    if (typeof rawId !== 'string' || !rawId.trim()) throw new Error(`Group index row ${i+1}: group ID must be a nonempty STRING dimension (preserve leading zeros).`);
    if (typeof rawName !== 'string' || !rawName.trim()) throw new Error(`Group index row ${i+1}: group name is missing.`);
    const id=rawId.trim(), name=rawName.trim();
    if ([id,name].some(s=>s.length>512||/[\u0000-\u001f\u007f]/.test(s))) throw new Error('Invalid/oversized index identity.');
    if (!byId.has(id)) byId.set(id,new Set());
    byId.get(id).add(name);
  }
  const groups=[...byId].sort((a,b)=>cmp(a[0],b[0])).map(([id,names])=>{
    const labels=[...names].sort(cmp);
    return {client_group_id:id,client_group_name:labels[0],aliases:[...new Set(labels.flatMap(nameVariants))],display_variants:labels};
  });
  return {identitySource:'runtime_catalog',groups,entities:[],source:options.source||'authorised Tableau index',loadedAt:new Date().toISOString()};
}
export function validateCatalog(data) {
  if (!data || !Array.isArray(data.groups)) throw new Error('Catalog groups required.');
  const ids=new Set();
  for (const g of data.groups) {
    if (typeof g.client_group_id!=='string'||!g.client_group_id.trim()||typeof g.client_group_name!=='string'||!g.client_group_name.trim()) throw new Error('Invalid group catalog identity.');
    if (ids.has(g.client_group_id)) throw new Error('Duplicate GROUP ID in catalog; names may repeat but IDs may not.');
    ids.add(g.client_group_id);
    if (!Array.isArray(g.aliases)||g.aliases.some(a=>typeof a!=='string')) throw new Error('Invalid runtime name variants.');
  }
  return data.groups;
}
export function catalogLookup(catalog) {
  if (caches.has(catalog)) return caches.get(catalog);
  validateCatalog(catalog);
  const byId=new Map(catalog.groups.map(g=>[g.client_group_id,g])), byName=new Map();
  for (const g of catalog.groups) for (const label of new Set([g.client_group_name,...g.aliases])) {
    const n=normal(label);if(!byName.has(n))byName.set(n,new Set());byName.get(n).add(g.client_group_id);
  }
  const index={byId,byName};caches.set(catalog,index);return index;
}
export function resolveCatalogGroup(value,catalog) {
  if (!value) return null;
  const {byId,byName}=catalogLookup(catalog);if(byId.has(value))return byId.get(value);
  const ids=[...(byName.get(normal(value))||[])];
  if(ids.length>1)throw new Error('This group name matches more than one ID. Select or enter a group ID.');
  return ids.length?byId.get(ids[0]):null;
}
export function catalogSignature(catalog) {
  // Deliberately not a cryptographic authentication mechanism. Detects index changes.
  return JSON.stringify(catalog.groups.map(g=>[g.client_group_id,g.client_group_name,[...g.aliases].sort(cmp)]));
}
export function catalogWithClients(catalog,clients) {
  const entities=[];
  for(const c of clients){
    if(!catalogLookup(catalog).byId.has(c.client_group_id))throw new Error('Detailed data returned a group outside the current index.');
    for(const e of c.rwa_json.entities)entities.push({client_group_id:c.client_group_id,entity_id:e.entity_id,entity:e.entity_name,aliases:nameVariants(e.entity_name)});
  }
  // A new object also invalidates all dictionary/fuzzy indexes built for the last view.
  return {...catalog,entities};
}
export function resolveGroup(q,groups){
  const text=' '+normal(q)+' ';
  const matches=groups.filter(g=>[g.client_group_id,g.client_group_name,...(g.aliases||[])].some(a=>normal(a)&&text.includes(' '+normal(a)+' ')));
  if(matches.length>1)throw new Error('More than one group matched. Use its unique ID.');return matches[0]||null;
}
export function isGroupOnly(q,g){return[g.client_group_id,g.client_group_name,...(g.aliases||[])].some(a=>normal(a)===normal(q));}
