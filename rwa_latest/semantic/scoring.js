/** Layers 6–7. Hand-defined weights only. Score is rule-fit, NOT a calibrated probability. */
export function scoreCommands(features,registry,hints={}){
  const candidates=[];
  for(const c of registry.commands.filter(c=>c.enabled)){
    const primary=Math.max(0,...c.primary_features.map(k=>features[k]||0));
    const scopeFit=c.scope==='ANY'||c.scope==='PORTFOLIO'&&hints.portfolio||c.scope==='GROUP'&&!hints.entity||c.scope==='ENTITY'&&hints.entity?1:0;
    const components=[
      {component:'intent',features:c.primary_features,strength:primary,weight:c.intent_weight},
      {component:'metric',features:['RWA'],strength:1,weight:c.metric_weight,source:features.RWA?'query':'domain-default'},
      {component:'scope',strength:scopeFit,weight:c.scope_weight},
      {component:'subject',strength:hints.subject||c.scope==='PORTFOLIO'?1:0,weight:c.subject_weight},
      {component:'period',strength:hints.period?1:0,weight:c.period_weight},
      {component:'modifier',strength:hints.modifier?1:0,weight:hints.modifier?c.modifier_weight:0}
    ];
    if(c.supporting_features.length)components.push({component:'support',features:c.supporting_features,strength:c.supporting_features.reduce((s,k)=>s+(features[k]||0),0)/c.supporting_features.length,weight:c.modifier_weight});
    for(const v of components)v.points=v.strength*v.weight;
    const contradictions=c.contradiction_features.filter(k=>(features[k]||0)>0).map(k=>({feature:k,strength:features[k],points:c.contradiction_weight*features[k]}));
    const positive=components.reduce((a,x)=>a+x.points,0),maximum=components.reduce((a,x)=>a+x.weight,0),penalty=contradictions.reduce((a,x)=>a+x.points,0);
    const score=Math.max(0,Math.min(1,(positive+penalty)/Math.max(maximum,1)));
    candidates.push({effectiveMinMargin:Math.max(c.min_margin,registry.settings.default_margin),commandId:c.command_id,intent:c.intent,action:c.action,score,positive,penalty,maximum,primary,components,contradictions,definition:c});
  }
  candidates.sort((a,b)=>b.score-a.score||a.commandId.localeCompare(b.commandId));
  return candidates;
}
