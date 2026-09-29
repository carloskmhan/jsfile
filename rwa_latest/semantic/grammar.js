/** Command-specific semantic grammar gates: similarity never substitutes for a well-formed command. */
const fail=(code,message)=>({code,message});
const gates={
 HISTORICAL_RANKING(p,s,r,f){
   const e=[];
   if(p.metric!=='PERCENT')e.push(fail('AMBIGUOUS_METRIC','Historical group peaks require a monthly percentage-change metric, not a balance or cumulative amount.'));
   if(!['UP','DOWN'].includes(p.direction))e.push(fail('AMBIGUOUS_DIRECTION','Choose highest or lowest monthly percentage change. Absolute percentage magnitudes are not this report.'));
   if(f.HISTORICAL_HIGH&&f.HISTORICAL_LOW)e.push(fail('AMBIGUOUS_DIRECTION','Choose either highest or lowest, not both.'));
   if(s.dimension&&s.dimension!=='GROUP'||r.subjects.length)e.push(fail('INVALID_SCOPE','This report ranks the portfolio of client groups. Use group exclusions to narrow it, or ask for a single-group peak report.'));
   if(!Number.isInteger(p.topN)||p.topN<1)e.push(fail('INVALID_NUMBER','Choose a bounded number of groups.'));
   if(p.driver||p.condition||p.excludedDrivers.length||p.excludedEntities.length||p.excludedEntityIds.length)
     e.push(fail('UNSUPPORTED_MODIFIER','Historical group peaks use unadjusted group balances. Driver/entity exclusions, driver metrics and threshold filters are not supported by this report.'));
   if(!['history','window','month'].includes(p.period.mode))e.push(fail('UNSUPPORTED_COMPARISON','Choose one reporting window, not a two-period comparison.'));
   return e;
 },
 MOVEMENT_REPORT(p,s,r,f){return (!p.group&&!p.entity)?[fail('MISSING_REQUIRED_SLOT','A recorded RWA report needs a known subject.')]:[];},
 MOVEMENT_CHECK(p,s,r,f){const e=[];if(!p.group)e.push(fail('MISSING_REQUIRED_SLOT','A movement check needs a known subject.'));if(!['UP','DOWN'].includes(p.direction))e.push(fail('AMBIGUOUS_DIRECTION','Specify increase or decrease for a movement check.'));return e;},
 DRIVER_AMOUNT(p){return p.driver?[]:[fail('MISSING_REQUIRED_SLOT','Name the attributed driver.')];},
 DRIVER_CHECK(p){return p.driver?[]:[fail('MISSING_REQUIRED_SLOT','A driver check needs a named driver.')];},
 ENTITY_AMOUNT(p){return p.entity?[]:[fail('MISSING_REQUIRED_SLOT','Name the subsidiary for its group contribution.')];},
 RANKING(p,s,r,f){const e=[];if(!['GROUP','ENTITY','PRODUCT','LOCATION'].includes(p.dimension))e.push(fail('INVALID_SCOPE','Ranking needs a rankable breakdown.'));if(!Number.isInteger(p.topN)||p.topN<1)e.push(fail('INVALID_NUMBER','Ranking needs a bounded N (explicit or the visible configured default).'));return e;},
 COMPARISON(p,s,r,f){return p.peer||p.period?.mode==='comparison'||p.groups.length===2||p.entities.length===2?[]:[fail('AMBIGUOUS_COMPARISON','Specify two comparison targets or two periods.')];},
 HISTORY(p){return p.group?[]:[fail('MISSING_REQUIRED_SLOT','A history report needs a subject.')];},
 RECONCILIATION(p){return p.group?[]:[fail('MISSING_REQUIRED_SLOT','Select a group/entity to reconcile.')];},
 OFFSETS(p){return p.group?[]:[fail('MISSING_REQUIRED_SLOT','Select a subject for the offsets report.')];},
 CONCENTRATION(p){return p.group&&!p.entity?[]:[fail('INVALID_SCOPE','Entity concentration is a group report.')];},
 MAIN_DRIVER(p){return p.group?[]:[fail('MISSING_REQUIRED_SLOT','Select the subject whose drivers should be ranked.')];}
};
export function validateCommandGrammar(plan,command,slots,relations,features){
 const gate=gates[command.grammar],errors=gate?gate(plan,slots,relations,features):[fail('INVALID_COMMAND_GRAMMAR','Unknown command grammar.')];
 return {grammar:command.grammar,valid:errors.length===0,errors};
}
