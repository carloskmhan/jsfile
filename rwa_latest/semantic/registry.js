/** Runtime artifact loader. Only an initial # header is stripped; no eval or dynamic code. */
export function parseRuleText(text) {
  const clean=String(text).replace(/^\uFEFF/,'').replace(/^(?:#[^\n]*\n)+/,'');
  return validateRegistry(JSON.parse(clean));
}
const ACTIONS = new Set('GROUP_ROOT_CAUSE ENTITY_DRIVER MAIN_DRIVER DRIVER_CONTRIBUTION DRIVER_CHECK ENTITY_CONTRIBUTION TOP_ENTITY TOP_CLIENTS COMPARE CONCENTRATION DATA_QUALITY OFFSETS TREND PEAK_MONTH MOVEMENT_CHECK'.split(' '));
const checked=new WeakSet();
export function validateRegistry(r) {
  if (checked.has(r)) return r;
  if (!r || r.schemaVersion!==5 || r.generated!==true) throw new Error('Expected the generated schema-5 language rules (v6 runtime catalog). Run python build_command_patterns.py; legacy registries cannot be mixed with this runtime.');
  for (const [key,limit] of [['commands',100],['synonyms',3000],['aliases',10000],['followups',1000]]) {
    if (!Array.isArray(r[key]) || r[key].length>limit) throw new Error('Invalid rule array: '+key);
  }
  if(!Array.isArray(r.fuzzyConfig)||!Array.isArray(r.units)||!Array.isArray(r.temporal)||!Array.isArray(r.grammarIds))throw new Error('Missing deterministic parser configuration. Rebuild the CSV artifact.');
  for(const c of r.fuzzyConfig){if(!Number.isFinite(c.threshold)||c.threshold<0||c.threshold>1||c.min_margin<.05||c.enabled&&(c.min_length<5||c.max_edits>2||c.category==='short_word'||c.threshold<.80))throw new Error('Unsafe fuzzy configuration.');}
  for(const u of r.units)if(!['absolute','ratio'].includes(u.kind)||!Number.isFinite(u.multiplier)||u.multiplier<=0)throw new Error('Invalid unit configuration.');
  if(r.identitySource!==undefined&&r.identitySource!=='runtime_catalog')throw new Error('Unknown identity source.');
  if(r.identitySource==='runtime_catalog'&&r.aliases.length)throw new Error('Runtime-catalog artifact must not contain customer aliases.');
  const ids=new Set();
  for (const c of r.commands) {
    if (ids.has(c.command_id)||!ACTIONS.has(c.action)||c.response_template!==c.action) throw new Error('Invalid/duplicate command executor.');
    ids.add(c.command_id);
    if(!r.grammarIds.includes(c.grammar))throw new Error('Invalid command grammar');
    for (const k of ['primary_features','supporting_features','contradiction_features','required_slots','optional_slots','forbidden_slots']) if(!Array.isArray(c[k])) throw new Error('Invalid command list '+k);
    for (const k of ['intent_weight','metric_weight','scope_weight','subject_weight','period_weight','modifier_weight','min_confidence','min_margin','contradiction_weight']) if(typeof c[k]!=='number'||!Number.isFinite(c[k])) throw new Error('Invalid rule weight '+k);
    if(c.min_confidence<0||c.min_confidence>1||c.min_margin<0||c.min_margin>1||c.contradiction_weight>=0||c.intent_weight<=0)throw new Error('Invalid rule thresholds.');
  }
  if(!r.settings||r.settings['inherit.result']!=='never'||r.settings.unknown_token_limit!==0)throw new Error('Unsafe or missing state/unknown-token policy.');
  for(const s of r.synonyms)if(typeof s.phrase!=='string'||!r.knownConcepts.includes(s.concept)||!(s.weight>0&&s.weight<=1))throw new Error('Invalid synonym.');
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}};freeze(r);checked.add(r);return r;
}
