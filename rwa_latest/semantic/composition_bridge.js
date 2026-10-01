/** A conservative acceptance gate around the existing parser/executor contract. */
import {removeSpans} from './text.js';
import {unknownContent} from './validation.js';
export function compositionEligible(legacy){
  if(legacy.ok||!['UNSUPPORTED_EXPRESSION','UNSUPPORTED_INTENT'].includes(legacy.code))return false;
  if(legacy.explain?.fuzzy?.corrections?.length)return false;
  const top=legacy.explain?.candidates?.[0];
  // A missing language primitive can be supplied; a conflicting winning command cannot be rescued.
  if(top?.primary&&(top.penalty<0||top.validation?.valid===false))return false;
  return legacy.code==='UNSUPPORTED_EXPRESSION'||!top?.primary;
}
export function composedContextPatch(text,lex,slots,relations,registry,composition){
  if(!composition.additions.some(m=>m.role==='PATCH_LINK'))return null;
  const rule=registry.composition.rules.find(r=>r.enabled&&r.shape==='CONTEXT_MODIFIER');
  if(!rule||!/^same but (?:exclude|excluding|without|include|including)\b/.test(text))return null;
  if(unknownContent(text,lex,slots,null).length||relations.errors.length)return null;
  const events=lex.matches.filter(m=>['EXCLUDE','INCLUDE','NEGATE'].includes(m.concept));
  if(events.length!==1||!['EXCLUDE','INCLUDE'].includes(events[0].concept))return null;
  if(!slots.drivers.length&&!slots.names.length)return null;
  const tail=removeSpans(text,[{start:0,end:events[0].end},...slots.names,...slots.drivers,...slots.periodSpans]);
  if(tail.replace(/\b(and|the|in|for|on|during)\b/g,'').replace(/[\s,.?!]/g,''))return null;
  return {rule:{rule_id:rule.rule_id,patch_type:events[0].concept,command_id:'',pattern:'<typed-composition>'},
    captures:{},matchedText:text,specificity:0,compositionRule:rule.rule_id};
}
export function validateCompositionGrammar({text,lex,slots,relations,plan,patch,registry,composition}){
  const fail=(code,message)=>({valid:false,code,message});
  if(relations.errors.length)return fail(relations.errors[0].code,relations.errors[0].message);
  const structural=removeSpans(text,[...lex.names,...lex.matches.filter(m=>m.driver)]);
  if(/\b(cumulative|forecast|predict|future|net|gross|if|unless|assuming)\b|\bwould have\b/.test(structural))
    return fail('UNSUPPORTED_COMPOSITION','This qualifier is outside the reviewed compositional grammar.');
  // Existing registered context patches retain sole ownership of conversation updates.
  // First release does not invent patches or reinterpret historical/comparison operations.
  if(patch&&!patch.compositionRule)return fail('UNSUPPORTED_COMPOSITION','New lexical composition of registered context patches is not enabled.');
  if(!patch&&!lex.concepts.RWA)return fail('MISSING_REQUIRED_SLOT','Use explicit RWA wording with a new compositional expression.');
  const rules=registry.composition.rules.filter(r=>r.enabled&&r.actions.includes(plan.action)&&(patch?r.shape==='CONTEXT_MODIFIER':r.shape!=='CONTEXT_MODIFIER'));
  if(rules.length!==1)return fail('UNSUPPORTED_COMPOSITION','No single reviewed composition shape supports this report.');
  if(rules.length>registry.composition.maxCandidates)return fail('COMPOSITION_LIMIT','Composition candidate limit exceeded.');
  const rule=rules[0],roles=new Set(composition.additions.map(m=>m.role));
  if(roles.has('PATCH_LINK')&&rule.shape!=='CONTEXT_MODIFIER')return fail('UNSUPPORTED_COMPOSITION','The word but requires a typed context modifier.');
  if(roles.has('SUBJECT_LINK')){
    if(rule.shape!=='RANKING')return fail('UNSUPPORTED_COMPOSITION','Whose requires a ranking subject.');
    for(const link of composition.additions.filter(m=>m.role==='SUBJECT_LINK')){
      const before=lex.matches.filter(m=>m.end<=link.start).at(-1);
      const after=lex.matches.find(m=>m.start>=link.end);
      if(!before||!['GROUP','ENTITY','RANK_GROUP','RANK_ENTITY'].includes(before.concept)||after?.concept!=='RWA'||
        text.slice(before.end,link.start).trim()||text.slice(link.end,after.start).trim())
        return fail('AMBIGUOUS_SCOPE','Attach whose directly to the ranking target and RWA.');
    }
  }
  if(rule.shape==='CONTEXT_MODIFIER'&&(!patch?.compositionRule||!roles.has('PATCH_LINK')))
    return fail('UNSUPPORTED_COMPOSITION','A validated typed context modifier is required.');
  if(rule.shape==='RANKING'&&roles.has('ATTRIBUTION'))return fail('AMBIGUOUS_COMMAND','A causal question cannot be reduced to a ranking.');
  if(rule.shape==='ATTRIBUTION'&&!/\b(why|what|who|explain|describe|tell|show|give)\b/.test(structural))
    return fail('UNSUPPORTED_COMPOSITION','Use an explicit request for recorded RWA attribution.');
  if(rule.shape==='MOVEMENT_CHECK'&&!/^(?:please )?(was|were|did|is|are|has|have|does|do)\b/.test(text))
    return fail('UNSUPPORTED_COMPOSITION','Use an explicit yes/no movement or driver question.');
  if(rule.shape==='RANKING'&&!['GROUP','ENTITY','PRODUCT','LOCATION'].includes(slots.dimension))
    return fail('MISSING_REQUIRED_SLOT','State the ranking target level.');
  if(rule.shape==='CONTRIBUTION'&&roles.has('ATTRIBUTION'))return fail('AMBIGUOUS_COMMAND','Do not replace a causal question with a contribution amount.');
  return {valid:true,ruleId:rule.rule_id,shape:rule.shape,source:rule.source};
}
