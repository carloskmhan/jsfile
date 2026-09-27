"""Optional LOCAL development A/B runner. No ML code is imported by the deployed app.
Uses the preserved original MiniLM package, never downloads a model. Same CSV/fixtures
and free-running conversations for both versions. --require-holdout checks labels, not
actual independence; a frozen reviewer manifest and unseen complete gold are required.
"""
from pathlib import Path
import argparse,base64,csv,hashlib,json,re,shutil,subprocess,sys,time
from playwright.sync_api import sync_playwright
from build_standalone import bundle
from holdout_guard import verify_manifest
ROOT=Path(__file__).resolve().parents[1]
ASSETS=['models/all-MiniLM-L6-v2/config.txt','models/all-MiniLM-L6-v2/tokenizer.txt','models/all-MiniLM-L6-v2/tokenizer_config.txt','models/all-MiniLM-L6-v2/special_tokens_map.txt','models/all-MiniLM-L6-v2/onnx/model_quantized.onnx','vendor/wasm/ort-wasm-simd.wasm','vendor/wasm/ort-wasm.wasm']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def heap(page):
 try:
  session=page.context.new_cdp_session(page);session.send('Performance.enable');v={m['name']:m['value'] for m in session.send('Performance.getMetrics')['metrics']};session.detach();return {k:v.get(k) for k in ['JSHeapUsedSize','JSHeapTotalSize']}
 except Exception:return None

def run(args):
 base=args.baseline_dir.resolve();corpus=args.corpus.resolve();out=args.out.resolve();out.parent.mkdir(parents=True,exist_ok=True)
 cases=list(csv.DictReader(corpus.open(encoding='utf-8-sig',newline='')))
 subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs';import {validateCases} from './tools/evaluate.mjs';import {parseCsv} from './csv_adapter.js';validateCases(parseCsv(fs.readFileSync(process.argv[1],'utf8')));",str(corpus)],cwd=ROOT,check=True)
 if not cases:raise ValueError('Corpus has no cases. Fill holdout_template.csv with independently authored queries and gold slots.')
 holdout=None
 if args.require_holdout:
  if not args.holdout_manifest:raise ValueError('--require-holdout also requires --holdout-manifest from the frozen independent-review workflow.')
  holdout=verify_manifest(corpus,args.holdout_manifest)
 for p in ASSETS+['vendor/transformers.min.js','rwa_engine.js','conversation.js','rwa_classifier.txt','embedding_config.txt','minilm_service.js']:
  if not (base/p).is_file():raise FileNotFoundError(f'Preserved baseline file missing: {p}. No remote download is attempted.')
 cfg=json.loads((base/'embedding_config.txt').read_text());model=json.loads((base/'rwa_classifier.txt').read_text())
 if model.get('type')!='minilm_logistic_regression' or model.get('embedding_signature')!=cfg.get('signature') or model.get('dimension')!=384:raise ValueError('Original classifier/embedding configuration mismatch.')
 for key,p in [('onnx_sha256',ASSETS[4]),('tokenizer_sha256',ASSETS[1])]:
  if cfg.get(key) and sha(base/p)!=cfg[key]:raise ValueError(f'Baseline integrity mismatch: {p}')
 if args.fixture: data=json.loads(args.fixture.read_text())
 else:
  data=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {loadFixtures} from './tools/evaluate.mjs'; console.log(JSON.stringify(loadFixtures()));"],cwd=ROOT,text=True))
 catalog=json.loads((args.catalog or ROOT/'rwa_sample_data.txt').read_text())
 source=(base/'vendor/transformers.min.js').read_text();m=re.search(r'export\{([^}]+)\};\s*//# sourceMappingURL',source)
 if not m:raise ValueError('Original vendor export layout changed; review runner adaptation, do not silently substitute a model.')
 pairs=[p.strip().split(' as ') for p in m[1].split(',')];vendor=source[:m.start()]+';globalThis.T={'+','.join(p[-1]+':'+p[0] for p in pairs)+'};'
 oldengine=re.sub(r'\bexport\s+class\s+','class ',(base/'rwa_engine.js').read_text())+'\nglobalThis.OldEngine=RwaQaEngine;'
 conversation=re.sub(r'\bexport\s+class\s+','class ',(base/'conversation.js').read_text())+'\nglobalThis.OldConversation=Conversation;'
 service=(base/'minilm_service.js').read_text()
 service=re.sub(r'^import[^\n]*\n','',service,flags=re.M)
 service=re.sub(r'\bexport\s+(?=(?:class|function)\s)','',service)
 service=service.replace("new URL('./',import.meta.url)","new URL('https://fixtures.invalid/')")
 service="(()=>{const {pipeline,env}=T;\n"+service+"\nglobalThis.OriginalService=MiniLMService;})();"

 sources={p:sha(base/p) for p in ['rwa_engine.js','conversation.js','minilm_service.js','rwa_classifier.txt',ASSETS[4],ASSETS[1]]}
 started=time.time();predictions=[];measurements={};net=[];parity={}
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=args.browser);version=browser.version
  # New and old in separate pages of the same Chromium process, run serially.
  for kind in ['rule','minilm']:
   print('Running',kind,'on',len(cases),'cases',flush=True)
   page=browser.new_page();page.set_default_timeout(180000);page.route('**/*',lambda route:route.abort());page.on('request',lambda r:net.append(r.url))
   mem0=heap(page);inject=time.perf_counter()
   page.evaluate('d=>globalThis.FIXTURE=d',data);page.evaluate('c=>globalThis.CATALOG=c',catalog)
   if kind=='rule':
    js=bundle(ROOT,test_mode=True).replace("M['app.js'].main(config);",'')
    page.add_script_tag(content=js)
    init=page.evaluate('''()=>{const t=performance.now();globalThis.eng=new RWA_TEST_MODULES['rwa_engine.js'].RwaQaEngine(FIXTURE.rows,{...FIXTURE,commandPatterns:RWA_TEST_CONFIG.commandPatterns,semanticCatalog:CATALOG,portfolioComplete:true});eng.parser.bind(eng.rows);return performance.now()-t;}''')
   else:
    page.evaluate('''()=>{globalThis.FILES={};globalThis.fetch=async u=>{const url=typeof u==='string'?u:u.url;const path=new URL(url).pathname.replace(/\\.json$/,'.txt');const f=FILES[path];if(!f)throw new Error('A/B fixture not registered: '+path);return new Response(f,{status:200});};}''')
    for p in ASSETS:page.evaluate('([n,b])=>{FILES["/"+n]=Uint8Array.from(atob(b),c=>c.charCodeAt(0));}',[p,base64.b64encode((base/p).read_bytes()).decode()])
    page.add_script_tag(content=vendor);page.add_script_tag(content=oldengine);page.add_script_tag(content=conversation);page.add_script_tag(content=service);page.evaluate('m=>globalThis.MODEL=m',model);page.evaluate('c=>globalThis.BASELINE_CONFIG=c',cfg)
    init=page.evaluate('''async()=>{const t=performance.now();T.env.allowLocalModels=true;T.env.allowRemoteModels=false;T.env.useBrowserCache=false;T.env.localModelPath='https://fixtures.invalid/models/';T.env.backends.onnx.wasm.wasmPaths='https://fixtures.invalid/vendor/wasm/';T.env.backends.onnx.wasm.numThreads=1;T.env.backends.onnx.wasm.proxy=false;globalThis.pipe=await T.pipeline('feature-extraction','all-MiniLM-L6-v2',{quantized:true,local_files_only:true});globalThis.eng=new OldEngine(null,FIXTURE.rows,{...FIXTURE,confidenceThreshold:.24});globalThis.conv=new OldConversation();return performance.now()-t;}''')
    page.evaluate('''()=>{globalThis.SVC=new OriginalService();SVC.config=BASELINE_CONFIG;SVC.model=MODEL;SVC.pipe=pipe;globalThis.inspect=async q=>(await SVC.inspect(q)).prediction;}''')
    warmup=page.evaluate("async()=>{const t=performance.now();await SVC.embed('RWA analysis');return performance.now()-t;}")
    parity_file=base/'parity_fixtures.json'
    if parity_file.exists():
     fixtures=json.loads(parity_file.read_text());checks=[]
     for f in fixtures:
      checks.append(page.evaluate('''async f=>{const r=await SVC.inspect(f.question);return{question:f.question,tokensEqual:JSON.stringify(r.tokens)===JSON.stringify(f.tokens),maxEmbeddingDifference:Math.max(...r.embedding.map((v,i)=>Math.abs(v-f.embedding[i])))};}''',f))
     parity={'fixtureCount':len(checks),'tokenMatches':sum(c['tokensEqual'] for c in checks),'maxEmbeddingDifference':max(c['maxEmbeddingDifference'] for c in checks),'warmupMs':warmup,'fixtures':checks}
     if parity['tokenMatches']!=len(checks) or parity['maxEmbeddingDifference']>1e-5:raise ValueError('Original MiniLM parity verification failed; inspect the adapter before comparing models.')

   injection_ms=(time.perf_counter()-inject)*1000;mem1=heap(page);last=None
   for i,c in enumerate(cases):
    if i%100==0:print(kind,'case',i+1,flush=True)
    if c['conversation_id']!=last:
     page.evaluate('k=>{if(k==="rule")eng.reset();else conv.reset();}',kind);last=c['conversation_id']
    ctx={k:c[v] for k,v in [('selectedClientGroup','context_group'),('selectedEntity','context_entity'),('selectedMonth','context_month')] if c.get(v)}
    if kind=='rule':
     result=page.evaluate('''({q,ctx})=>{const t=performance.now();try{const p=eng.parseQuestion(q,ctx),parseMs=performance.now()-t;const r=p.ok?eng.answer(q,ctx):null;return {accepted:p.ok,code:p.code||'ACCEPT',plan:p.plan,parseMs,totalMs:performance.now()-t,executed:!!r?.ok,dataError:r&&!r.ok?r.answer:null};}catch(e){return{accepted:false,code:'ERROR',error:e.message,parseMs:performance.now()-t,totalMs:performance.now()-t};}}''',{'q':c['question'],'ctx':ctx})
    else:
     result=page.evaluate('''async({q,ctx})=>{const t=performance.now();try{const pr=conv.prepare(q,ctx,eng),pred=await inspect(pr.question),p=eng.parseQuestion(pr.question,pr.context,pred),parseMs=performance.now()-t;const r=eng.answer(pr.question,pr.context,pred);conv.accept(q,r);return{accepted:!r.lowConfidence&&!!r.result,code:r.lowConfidence?'LOW_CONFIDENCE':r.result?'ACCEPT':'NO_RESULT',parsed:p,prediction:pred,prepared:pr.question,parseMs,totalMs:performance.now()-t,answer:r.answer,executed:!r.lowConfidence&&!!r.result};}catch(e){return{accepted:false,code:'ERROR',error:e.message,parseMs:performance.now()-t,totalMs:performance.now()-t};}}''',{'q':c['question'],'ctx':ctx})
    predictions.append({'engine':kind,'id':c['id'],**result})
   measurements[kind]={'initializationMs':init,'assetInjectionAndInitializationMs':injection_ms,'memoryBeforeInjection':mem0,'memoryAfterInitialization':mem1,'memoryAfterCorpus':heap(page)};page.close()
  browser.close()
 payload={'holdoutManifest':holdout,'suite':'Measured local same-Chromium A/B on preserved original app; developer corpus unless independently supplied','corpus':str(corpus.name),'corpusSha256':sha(corpus),'splits':sorted({r.get('split','') for r in cases}),'baselineHashes':sources,'newRuntimeHashes':{str(p.relative_to(ROOT)):sha(p) for p in sorted(list((ROOT/'semantic').glob('*.js'))+[ROOT/'rwa_engine.js',ROOT/'rule_parser.js',ROOT/'command_patterns.txt'])},'browser':version,'timing':measurements,'durationSeconds':time.time()-started,'networkRequests':net,'baselineParity':parity,'limitations':['Existing baseline app, not intrinsic MiniLM superiority; missing execution fields are reported as unobservable, not inferred from gold.','Both have identical fixtures, contexts and free-running state; no expected commands are fed back.','In-memory asset delivery, not bank HTTP/CDN/SSO or network load timing.','CDP JS heap is partial: not full process/WASM/native memory. Asset transport and fixture duplication are included.','No independent accuracy claim for development corpus; --require-holdout needs a hash-frozen reviewer manifest and overlap check; these still do not prove reviewer independence.'],'identityMappings':{'groups':{r['client_group']:r.get('client_group_id',r['client_group']) for r in data['rows']},'entities':{r['client_group']+'\0'+r['entity']:r.get('entity_id',r['entity']) for r in data['rows']}},'predictions':predictions}
 out.write_text(json.dumps(payload,ensure_ascii=False,indent=2))
 subprocess.run(['node',str(ROOT/'tools/score_ab.mjs'),str(corpus),str(out)],cwd=ROOT,check=True)
 print('Saved',out)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--baseline-dir',type=Path,required=True);p.add_argument('--corpus',type=Path,default=ROOT/'tests/questions.csv');p.add_argument('--out',type=Path,default=ROOT/'reports/ab_results.json');p.add_argument('--fixture',type=Path);p.add_argument('--catalog',type=Path);p.add_argument('--require-holdout',action='store_true');p.add_argument('--holdout-manifest',type=Path);p.add_argument('--browser',default=shutil.which('chromium'));a=p.parse_args()
 try:run(a)
 except Exception as e:print(f'A/B not completed: {type(e).__name__}: {e}',file=sys.stderr);raise SystemExit(1)
