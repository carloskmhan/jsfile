import {parseRuleText} from './semantic/registry.js';
import {localText} from './network.js';
try{
 const config=JSON.parse(await localText('./tableau_config.txt'));
 config.rules=config.rulesUrl?JSON.parse(await localText(config.rulesUrl)):{};
 config.commandPatterns=parseRuleText(await localText(config.commandPatternsUrl||'./command_patterns.txt'));
 if(config.commandPatterns.identitySource!=='runtime_catalog'||config.commandPatterns.aliases.length)throw new Error('Recompile the v6 language rules. The connected runtime does not load static customer aliases.');
 if(config.requireConfirmation!==true)throw new Error('This review build requires explicit report confirmation.');
 if(config.mode==='tableau'&&config.liveReviewAcknowledged!==true)throw new Error('Live mode is locked pending your bank’s deployment/governance review. See DEPLOYMENT_REVIEW.md.');
 if(!['sample','tableau'].includes(config.mode))throw new Error('mode must be sample or tableau.');
 const origins=new Set();
 if(config.mode==='tableau'){
  if(!config.tableauUrl||config.tableauUrl.includes('YOUR_'))throw new Error('Set the internal tableauUrl in tableau_config.txt.');
  for(const value of [config.tableauUrl,config.apiUrl,...(config.additionalAllowedOrigins||[])].filter(Boolean)){
   const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Only approved HTTPS Tableau origins without credentials are allowed.');origins.add(u.origin);
  }
 }
 const allowed=[...origins].join(' '),meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';
 meta.content=`default-src 'self'; script-src 'self' ${allowed}; style-src 'self' 'unsafe-inline'; connect-src 'self' ${allowed}; frame-src 'self' ${allowed}; img-src 'self' data: ${allowed}; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'none'`;
 // A server-set CSP header and frame-ancestors policy are still required for production review.
 document.head.append(meta);const {main}=await import('./app.js');const outcome=await main(config);
 if(outcome?.ok===false)throw new Error(outcome.message);
}catch(e){
 const raw=typeof e?.message==='string'?e.message:'Application configuration or script could not be loaded.';
 const message=raw.startsWith('Initialization failed:')?raw:'Initialization failed: '+raw;
 const status=document.getElementById('status');if(status){status.textContent=message;status.classList.add('error');}
 const progress=document.getElementById('progress');if(progress)progress.hidden=true;
 document.documentElement.dataset.rwaAppReady='false';
 document.documentElement.dataset.rwaStartupError=message;
 document.dispatchEvent(new CustomEvent('rwa:startup-failed',{detail:{message}}));
}finally {
 // Settled does NOT mean authenticated. Only main's validated ready result
 // releases the cover; errors stay visible with an explicit reload action.
 const root=document.documentElement;
 root.dataset.rwaInitialization=root.dataset.rwaAppReady==='true'?'ready':'failed';
 document.dispatchEvent(new Event('rwa:initialization-settled'));
}

