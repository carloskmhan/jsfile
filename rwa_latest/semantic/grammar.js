/** Command-specific semantic grammar gates: similarity never substitutes for a well-formed command. */
const fail=(code,message)=>({code,message});
const gates={
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
