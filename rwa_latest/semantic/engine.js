import {driverCatalog} from '../driver_catalog.js';
import {normalizedInput,norm,clone,uniq} from './text.js';
import {validateRegistry} from './registry.js';
import {Dictionary,identityCatalog} from './dictionary.js';
import {extractSlots,publicSlots} from './slots.js';
import {parseRelations} from './relations.js';
import {semanticFeatures} from './features.js';
import {scoreCommands} from './scoring.js';
import {findFollowup,projectContext} from './followups.js';
import {unknownContent,detectUnsupported,validateConstraints,decide} from './validation.js';
import {prepareLexical} from './lexical.js';
import {failureCategory} from './diagnostics.js';
import {validateCommandGrammar} from './grammar.js';
import {shiftMonth} from './periods.js';
export const RULE_VERSION='6.0.12-history-percent-review';
const patchPrimary={HISTORICAL_GROUP_PEAK:'HISTORICAL_GROUP_REQUEST',GROUP_ROOT_CAUSE:'RWA_DRIVER',ENTITY_DRIVER:'RWA_DRIVER',MAIN_DRIVER:'MAIN_DRIVER_REQUEST',DRIVER_CONTRIBUTION:'DRIVER_AMOUNT',DRIVER_CHECK:'DRIVER_CHECK_REQUEST',ENTITY_CONTRIBUTION:'ENTITY_AMOUNT',TOP_CLIENTS:'RANK_GROUP',TOP_ENTITY:'RANK_ENTITY',COMPARE:'COMPARE_REQUEST',TREND:'TREND_REQUEST',PEAK_MONTH:'PEAK_REQUEST',OFFSETS:'OFFSETS_REQUEST',DATA_QUALITY:'RECONCILE_REQUEST',CONCENTRATION:'CONCENTRATION_REQUEST'};
export class SemanticEngine {
  constructor(options={}){
    if(!options.commandPatterns)throw new Error('Compiled CSV rules are required. Load command_patterns.txt before constructing the engine.');
    this.registry=validateRegistry(options.commandPatterns);this.options=options;this.identities=[];this.dictionary=null;this.boundRows=null;
  }
  bind(rows){
    if(this.boundRows===rows&&this.dictionary)return;
    this.boundRows=rows;this.identities=identityCatalog(rows,this.options.semanticCatalog,{...this.options,registry:this.registry});this.dictionary=new Dictionary(this.registry,this.identities,driverCatalog(rows).labels);
  }
  parse(question,rows,context={},state={}){
    const started=performance.now();this.bind(rows);
    const explain={pipelineVersion:RULE_VERSION,input:String(question),normalization:null,matches:[],semanticFeatures:{},candidates:[],constraints:[],contextPatch:null};
    const fail=(code,message,extra={})=>({ok:false,status:code.startsWith('AMBIGUOUS')?'ambiguous':code.startsWith('UNSUPPORTED')?'unsupported':'clarify',code,message,choices:[],trace:['semantic-'+RULE_VERSION,code],explain:{...explain,decision:code,failureCategory:failureCategory(code),latencyMs:performance.now()-started,...extra}});
    let input=normalizedInput(question,this.registry.settings.max_query_chars);explain.normalization=input.text;
    if(input.error)return fail(input.code,input.error);
    const prepared=prepareLexical(input.text,this.dictionary,{disabled:this.options.disableFuzzy===true});
    explain.phraseResolution=prepared.phraseResolution;explain.fuzzy=prepared.fuzzy;explain.correctedText=prepared.text;
    if(prepared.error)return fail(prepared.error.code,prepared.error.message);
    input={...input,text:prepared.text};const lex=prepared.lex;explain.matches=[...lex.names.map(n=>({phrase:n.text,concept:n.item.kind,id:n.item.id,name:n.item.name,start:n.start,end:n.end})),...lex.matches.map(m=>({phrase:m.text,concept:m.concept,weight:m.weight,source:m.source,start:m.start,end:m.end}))];
    if(lex.collisions.length)return fail('AMBIGUOUS_ENTITY','This display name matches multiple IDs. Specify one of: '+lex.collisions.flatMap(c=>c.targets).slice(0,8).map(t=>t.kind+' '+t.id+' ('+t.name+')').join('; '),{aliasCollisions:lex.collisions});
    const unsupported=detectUnsupported(lex,input.text);if(unsupported)return fail(unsupported.code,unsupported.message);
    if(lex.concepts.HELP&&lex.names.length===0)return fail('HELP','Ask about recorded RWA drivers, top groups/entities, thresholds, comparisons, trends, offsets or reconciliation.');
    const looksFollow=/^(?:please )?(?:how about|what about|and|same|do the same|only those|compare (?:it|that|the|both|them)|rank those|sort those|which of those|why[?!]*$|what drove (?:it|that)|what are the offsets|does it reconcile|exclude|excluding|include|restore|put|clear|shorter|briefly|in one|more detail|what about the next|top \d+ instead|at group level|back to|again)/.test(input.text);
    const namesForAnchor=lex.names.map(n=>n.item),namedGroup=namesForAnchor.find(x=>x.kind==='GROUP')?.id||namesForAnchor.find(x=>x.kind==='ENTITY')?.parentId;
    const scopedRows=rows.filter(r=>!namedGroup||r.client_group_id===namedGroup);
    const latest=scopedRows.map(r=>r.month).sort().at(-1)||rows.map(r=>r.month).sort().at(-1);
    const anchor=(looksFollow&&state.action?(state.period?.month||state.anchorMonth):null)||context.selectedMonth||context.month||latest;
    const slots=extractSlots(input.text,lex,anchor,this.registry.settings,this.registry);
    explain.temporalAnchor={month:anchor,source:looksFollow&&state.action&&(state.period?.month||state.anchorMonth)?'LAST_EXECUTED_ANALYSIS':context.selectedMonth||context.month?'TABLEAU_CONTEXT':'LATEST_LOADED_REPORT'};
    explain.numbers=slots.numbers||[];explain.temporal=slots.temporalDebug;
    if(slots.error)return fail(slots.code,slots.error);
    const relations=parseRelations(input.text,lex,slots);
    let patch=findFollowup(input.text,slots,relations,this.registry,lex);if(patch?.error)return fail(patch.code,patch.error);
    if(!state.action&&patch?.rule.pattern==='{scope}')patch=null;
    const features=semanticFeatures(lex,slots,relations,patch);
    if(!patch&&lex.names.length===1&&norm(lex.names[0].text)===input.text.replace(/[?.!]$/,''))features.RWA_DRIVER=1;
    // A balance query with a named subject is still a recorded RWA report.
    if(!patch&&!features.RWA_DRIVER&&!relations.driver&&lex.concepts.RWA&&lex.concepts.CHECK&&!features.COMPARE_REQUEST&&!features.RANK_GROUP&&!features.RANK_ENTITY&&!features.PEAK_REQUEST&&!features.MOVEMENT_CHECK_REQUEST)features.RWA_DRIVER=1;
    const projection=projectContext({patch,state,context,slots,relations,identities:this.identities,registry:this.registry,anchor,text:input.text});
    if(projection.error)return fail(projection.code,projection.error);
    explain.contextPatch=projection.patch;
    if(patch){for(const k of Object.values(patchPrimary))delete features[k];const key=projection.plan.action==='MOVEMENT_CHECK'?'MOVEMENT_CHECK_REQUEST':patchPrimary[projection.plan.action];if(key)features[key]=1;}
    explain.semanticFeatures=features;explain.normalizedSemantics=explain.matches.map(x=>x.id||x.concept).join(' ');
    const p0=projection.plan;
    const candidates=scoreCommands(features,this.registry,{subject:!!p0.group||!!p0.entity,entity:!!p0.entity,period:!!p0.period,portfolio:!!(features.RANK_GROUP||features.HISTORICAL_GROUP_REQUEST),modifier:!!features.HAS_MODIFIER});
    for(const candidate of candidates){
      const p=clone(p0),cmd=candidate.definition;p.action=cmd.action;p.commandId=cmd.command_id;p.semanticIntent=cmd.intent;
      if(cmd.action==='GROUP_ROOT_CAUSE'&&p.entity)p.action='ENTITY_DRIVER';
      if(cmd.action==='GROUP_ROOT_CAUSE')p.responseVariant=p.metric==='BALANCE'?'BALANCE':features.MOVEMENT_AMOUNT_REQUEST?'AMOUNT':null;
      if(['TOP_CLIENTS','HISTORICAL_GROUP_PEAK'].includes(cmd.action)){p.group=null;p.groupId=null;p.entity=null;p.entityId=null;p.dimension='GROUP';}
      if(cmd.action==='TOP_ENTITY'){p.entity=null;p.entityId=null;p.dimension=['PRODUCT','LOCATION'].includes(p.dimension)?p.dimension:'ENTITY';}
      if(cmd.action==='HISTORICAL_GROUP_PEAK'){
        if(!slots.period&&!patch)p.period={mode:'history',end:anchor};
        if(p.direction==='AUTO')p.direction='UP';
        // History scope still ends at the existing analysis reference month.
        p.anchorMonth=p.period.month||p.period.end||anchor;
      }
      if(cmd.action==='PEAK_MONTH'&&!slots.period&&!patch){p.period={mode:'history',end:anchor};if(lex.concepts.PEAK&&!lex.concepts.INCREASE&&!lex.concepts.DECREASE&&!/spike|jump|change|movement/.test(input.text))p.metric='BALANCE';}
      if(cmd.action==='TREND'&&!slots.period&&!patch)p.period={mode:'window',start:shiftMonth(anchor,1-this.registry.settings.default_window_months),end:anchor};
      if(['DRIVER_CONTRIBUTION','ENTITY_CONTRIBUTION','DRIVER_CHECK'].includes(cmd.action)&&p.metric==='PERCENT'){p.metric='CHANGE';p.contributionShareRequested=true;}
      if(cmd.action==='COMPARE')p.peer=/\b(peers?|benchmark|other groups|portfolio)\b/.test(input.text)&&p.groups.length<2&&p.entities.length<2&&p.period.mode!=='comparison';
      // RWA direction words do not rewrite facts; executor reports the recorded sign.
      if(!['TOP_ENTITY','TOP_CLIENTS','HISTORICAL_GROUP_PEAK'].includes(cmd.action)){p.dimension=null;p.candidateEntities=[];p.candidateEntityIds=[];p.candidateGroups=[];p.candidateGroupIds=[];}
      if(slots.threshold&&p.metric==='BALANCE')p.condition.metric='BALANCE';
      if(slots.threshold&&p.driver&&p.condition.metric!=='BALANCE'){p.condition.metric=slots.threshold.metric==='PERCENT'?'PERCENT':'DRIVER';}
      if(/\bnot only\b/.test(input.text))relations.errors.push({code:'AMBIGUOUS_NEGATION',message:'Use “main driver” or “only driver” explicitly; “not only” is ambiguous here.'});
      candidate.grammar=validateCommandGrammar(p,cmd,slots,relations,features);
      candidate.validation=validateConstraints(p,cmd,slots,relations,this.registry.settings);
      if(!candidate.grammar.valid){candidate.validation.valid=false;candidate.validation.errors.unshift(...candidate.grammar.errors);}
      candidate.plan=p;
    }
    const summaries=candidates.slice(0,this.registry.settings.top_k).map(({definition,plan,...c})=>c);
    explain.candidates=summaries;explain.constraints=summaries.map(c=>({commandId:c.commandId,...c.validation}));
    const unknown=unknownContent(input.text,lex,slots,patch);explain.unknownTokens=unknown;
    if(prepared.fuzzy.corrections.length){
      const exactEvidence=prepared.phraseResolution.matches.filter(m=>!prepared.fuzzy.corrections.some(c=>c.start<m.end&&c.end>m.start));
      const supporting=exactEvidence.some(m=>['RWA','GROUP','ENTITY','INCREASE','DECREASE','COMPARE','ROOT','RANK'].includes(m.concept))||prepared.lex.names.some(n=>!prepared.fuzzy.corrections.some(c=>c.start<n.end&&c.end>n.start))||!!(patch&&state.action);
      if(!supporting)return fail('LOW_CONFIDENCE','A fuzzy correction alone is not enough evidence to execute a command.');
    }
    const decision=decide(candidates,unknown,relations);
    if(decision)return fail(decision.code,decision.message);
    const top=candidates[0],plan=top.plan;
    plan.trace=['semantic-'+RULE_VERSION,...(patch?['context-patch:'+patch.rule.rule_id]:[]),'command:'+plan.commandId];
    plan.ruleConfidence=top.score;plan.margin=top.score-(candidates[1]?.score||0);plan.scoreMeaning='manual rule-fit; not probability';
    plan.contextNotes=projection.notes;plan.semantic=publicSlots(plan);
    explain.slots=plan.semantic;explain.fuzzy.validatedCommand=true;explain.decision='ACCEPT';explain.latencyMs=performance.now()-started;
    return{ok:true,plan,explain,trace:plan.trace};
  }
}
