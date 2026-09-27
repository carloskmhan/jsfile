import {indexRowsToCatalog,nameVariants} from '/engine/group_catalog.js';
import {RwaQaEngine} from '/engine/rwa_engine.js';
import {parseRuleText} from '/engine/semantic/registry.js';
import {loadClientCsv,parseCsv,expandCsvRows} from '/engine/csv_adapter.js';
import {tableauRowToClient} from '/engine/tableau_adapter.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function localCsv(text,catalog={groups:[]}){
  const records=parseCsv(text);
  if(records[0]?.json_data!==undefined){
    const fields={id:'client_group_id',name:'client_group_name',location:'group_location',json:'json_data'};
    return expandCsvRows(records.map(r=>{
      const group=catalog.groups?.find(g=>g.client_group_id===r.client_group_id)||{client_group_id:r.client_group_id,client_group_name:r.client_group_name,aliases:[]};
      return tableauRowToClient(r,group,fields);
    }));
  }
  return loadClientCsv(text);
}
export class TestLab {
  constructor(){this.engine=null;this.fingerprint='';this.assets=null;this.override=null;this.pending=null;this.history=[];this.lastChecks=null;}
  setAssets(assets){this.assets=assets;this.reset();}
  getData(){
    if(this.override){const d=this.override;const catalog=indexRowsToCatalog(d.rows.map(r=>({client_group_id:r.client_group_id,client_group_name:r.client_group})));return {...d,semanticCatalog:{...catalog,entities:[...new Map(d.rows.map(r=>[r.client_group_id+'/'+r.entity_id,{client_group_id:r.client_group_id,entity_id:r.entity_id,entity:r.entity,aliases:nameVariants(r.entity)}])).values()]}};}
    const catalog=indexRowsToCatalog(parseCsv(this.assets['tableau_sample.csv']));
    const d=localCsv(this.assets['tableau_sample.csv'],catalog);
    const rules=JSON.parse(this.assets['rules_config.txt']||'{}');
    return {...d,entityAliases:{...d.entityAliases,...rules.entityAliases},
      semanticCatalog:{...catalog,entities:[...new Map(d.rows.map(r=>[r.client_group_id+'/'+r.entity_id,{client_group_id:r.client_group_id,entity_id:r.entity_id,entity:r.entity,aliases:nameVariants(r.entity)}])).values()]},label:'Project tableau_sample.csv (local test data, not a live server)'};
  }
  reset(){this.engine=null;this.fingerprint='';this.pending=null;this.history=[];}
  ensure(text,hash){
    if(this.engine&&this.fingerprint===hash)return this.engine;
    const d=this.getData();
    this.engine=new RwaQaEngine(d.rows,{...d,commandPatterns:parseRuleText(text),portfolioComplete:true,unit:'USDm'});
    this.fingerprint=hash;this.pending=null;this.history=[];return this.engine;
  }
  parse(query,context){
    if(!this.engine)throw Error('Validate the rules first, or select the saved version.');
    const result=this.engine.parseQuestion(query,context);
    this.pending=result.ok?{query,context:copy(context),state:JSON.stringify(this.engine.state)}:null;
    return result;
  }
  execute(){
    const p=this.pending;
    if(!p||p.state!==JSON.stringify(this.engine.state))throw Error('The context has changed. Check the interpretation again.');
    this.pending=null;
    const result=this.engine.answer(p.query,p.context);
    this.history.push({query:p.query,ok:result.ok,answer:result.answer||result.message||'No result.'});
    return result;
  }
  async importData(file){
    if(file.size>8_000_000)throw Error('Test data files must be 8 MB or smaller.');
    const text=await file.text();let d;
    if(file.name.toLowerCase().endsWith('.csv'))d=localCsv(text);
    else {const o=JSON.parse(text);d=Array.isArray(o)?{rows:o}:o;if(!Array.isArray(d.rows))throw Error('JSON must be a rows array or an object with {rows:[...]}.');}
    if(!d.rows.length||d.rows.length>50000)throw Error('Test data must contain 1–50,000 rows.');
    // The real engine validates the rows when instantiated. Nothing is uploaded to Python.
    this.override={...d,label:'File read only in this browser: '+file.name};this.reset();
  }
  resetData(){this.override=null;this.reset();}
  groups(){return this.getData().semanticCatalog.groups.map(g=>({id:g.client_group_id,name:g.client_group_name}));}
  async runChecks(text,hash,tests=null){
    const cases=tests||DEFAULT_CHECKS;
    if(!Array.isArray(cases)||!cases.length||cases.length>1000)throw Error('The check list must contain 1–1,000 cases.');
    const d=this.getData(),registry=parseRuleText(text),engines=new Map(),rows=[];
    let completed=0;
    for(const [i,t]of cases.entries()){
      if(typeof t.query!=='string'||!t.expected||typeof t.expected!=='object')throw Error(`Check ${i+1}: a query and an expected object are required.`);
      const key=t.sequence||'single-'+i;
      if(!engines.has(key))engines.set(key,new RwaQaEngine(d.rows,{...d,commandPatterns:registry,portfolioComplete:true,unit:'USDm'}));
      const eng=engines.get(key),ctx=t.context||{selectedClientGroup:'SAMSUNG GROUP',selectedMonth:'2026-07'};
      const at=performance.now();let result;
      try{result=eng.parseQuestion(t.query,ctx);}catch(e){result={ok:false,code:'EXCEPTION',message:e.message};}
      const parseMs=performance.now()-at;
      const actual={ok:result.ok,code:result.code||null,action:result.plan?.action||null,
        group:result.plan?.group||null,entity:result.plan?.entity||null,
        month:result.plan?.period?.month||null,topN:result.plan?.topN||null,
        excludedDrivers:result.plan?.excludedDrivers||[],condition:result.plan?.condition||null};
      const errors=[];
      for(const[k,v]of Object.entries(t.expected)){
        if(!Object.hasOwn(actual,k))throw Error(`Check ${i+1}: unsupported expected field ${k}.`);
        if(JSON.stringify(actual[k])!==JSON.stringify(v))errors.push({field:k,expected:v,actual:actual[k]});
      }
      let execution=null;
      if(t.commit===true&&result.ok){execution=eng.answer(t.query,ctx);if(!execution.ok)errors.push({field:'sample execution',expected:'success',actual:execution.answer||execution.message});}
      rows.push({id:t.id||String(i+1),query:t.query,pass:errors.length===0,actual,errors,parseMs,decision:result.code||'ACCEPT'});
      if(++completed%20===0)await new Promise(r=>setTimeout(r,0));
    }
    this.lastChecks={generatedAt:new Date().toISOString(),ruleHash:hash,testKind:tests?'User-imported local tests':'Developer-authored smoke checks, NOT independent validation',
      dataset:this.getData().label,total:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
    return this.lastChecks;
  }
}
export const DEFAULT_CHECKS=[
 {id:'ROOT',query:"Why did Samsung's RWA increase in July?",expected:{ok:true,action:'GROUP_ROOT_CAUSE',group:'SAMSUNG GROUP',month:'2026-07'}},
 {id:'TYPO',query:'Why did Samsng RWA increse in July?',expected:{ok:true,action:'GROUP_ROOT_CAUSE',group:'SAMSUNG GROUP',month:'2026-07'}},
 {id:'GROUP_RANK',query:'Show top ten groups with RWA above 25 million in June',expected:{ok:true,action:'TOP_CLIENTS',month:'2026-06',topN:10}},
 {id:'ENTITY_RANK',query:'Top 3 entities excluding FX in June',expected:{ok:true,action:'TOP_ENTITY',month:'2026-06',topN:3,excludedDrivers:['FX']}},
 {id:'COMPARE',query:'Compare Samsung and Toyota in July',expected:{ok:true,action:'COMPARE',month:'2026-07'}},
 {id:'FORECAST',query:'Predict Samsung RWA next year.',expected:{ok:false}},
 {id:'OUT_OF_SCOPE',query:'Tell me a joke.',expected:{ok:false}},
 {id:'SHARE_PRICE',query:"What is Samsung's share price?",expected:{ok:false}},
 {id:'DATE_TYPO',query:'Why did Samsung RWA increase in Jully?',expected:{ok:false}},
 {id:'TURN_1',sequence:'follow',query:"Why did Samsung's RWA increase in July?",commit:true,expected:{ok:true,group:'SAMSUNG GROUP',month:'2026-07'}},
 {id:'TURN_2',sequence:'follow',query:'How about Toyota?',commit:true,expected:{ok:true,group:'TOYOTA GROUP',month:'2026-07'}},
 {id:'TURN_3',sequence:'follow',query:'And August?',expected:{ok:true,group:'TOYOTA GROUP',month:'2026-08'}}
];
