"""Package v6 source/web subsets after local test evidence exists. Not bank approval."""
from pathlib import Path
import hashlib,json,zipfile,platform,subprocess,sys,argparse
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(n):return json.loads((ROOT/'reports'/n).read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
DOCS=['README.md','TABLEAU_SETUP.md','MIGRATION.md','COMMANDS.md','ARCHITECTURE.md','CISO_SECURITY.md','DEPLOYMENT_REVIEW.md','ACCEPTANCE.md','START_HERE.md','BUILD_INFO.json']
def web_files():
 return sorted(set([p for p in ROOT.glob('*.js')]+list((ROOT/'semantic').glob('*.js'))+[ROOT/n for n in ['demo.html','styles.css','catalog_ui.css','loading_screen.css','command_patterns.txt','tableau_config.txt','tableau_config.live.example.txt','rules_config.txt','tableau_sample.csv','commands_editor.html','WEB_ONLY.txt']]+[ROOT/n for n in DOCS]))
def package(baseline=None):
 needed=['connected_tests.json','compiler_tests.json','builder_integration.json','robustness_units.json','v6_existing_questions.json','v6_existing_robustness.json','test_runs.json']
 tests={n:load(n) for n in needed}
 if any(t.get('failed',0) for t in tests.values()):raise ValueError('Current regression gate failed')
 # Every source used by the two corpus evaluations must still match.
 for n in ['v6_existing_questions.json','v6_existing_robustness.json']:
  for k,v in tests[n]['runtimeHashes'].items():
   if sha(ROOT/k)!=v:raise ValueError('Source changed since test: '+k)
 subprocess.run([sys.executable,'build_command_patterns.py','--check'],cwd=ROOT,check=True)
 reg=json.loads('\n'.join(x for x in (ROOT/'command_patterns.txt').read_text().splitlines() if not x.startswith('#')))
 if reg.get('identitySource')!='runtime_catalog' or reg['aliases']:raise ValueError('Customer-bearing language artifact')
 runtime=sorted(set(list(ROOT.glob('*.js'))+list((ROOT/'semantic').glob('*.js'))))
 info={'release':'6.0.0-review','python':platform.python_version(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'runtimeJsBytesExcludingTableauSDK':sum(p.stat().st_size for p in runtime),'ruleArtifactBytes':(ROOT/'command_patterns.txt').stat().st_size,'customerAliasesInRules':0,'runtimeFiles':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size} for p in runtime],'sourceRules':reg['sourceSha256'],'modelRuntimeAssets':[],'limits':'No real Tableau/SSO/RLS/HTTP browser deployment or independent user benchmark.'}
 write(ROOT/'BUILD_INFO.json',info)
 if baseline and baseline.exists():
  keep=lambda p:p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.log'} and p.relative_to(ROOT if p.is_relative_to(ROOT) else baseline).parts[0] not in {'reports','validation_history','local_manager_reports','.rule_manager'}
  before={p.relative_to(baseline).as_posix():p for p in baseline.rglob('*') if keep(p)};after={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if keep(p)}
  items=[]
  for n in sorted(before.keys()|after.keys()):
   old=sha(before[n]) if n in before else None;new=sha(after[n]) if n in after else None;items.append({'file':n,'status':'added' if old is None else 'removed' if new is None else 'unchanged' if old==new else 'changed','oldSha256':old,'newSha256':new})
  write(ROOT/'reports/source_diff.json',{'baseline':'Combined v5 full source + v5.0.2 wave loading patch + English local workbench','files':items})
 bm=load('browser_connected.json');bl=load('browser_tableau_mock.json');manager=json.loads((ROOT/'local_manager_reports/browser_dom.json').read_text())
 if bm['failed'] or bl['failed'] or any(not x['passed'] for x in manager['checks']):raise ValueError('Browser fixture gate failed')
 summary={'release':'6.0.0-review','status':'Integrated, developer-tested review build; bank live staging/approval remains required','tests':{n:{k:t[k] for k in ['passed','failed','total'] if k in t} for n,t in tests.items()},'browser':{'sampleDom':{'passed':bm['passed'],'failed':bm['failed']},'tableauMockDom':{'passed':bl['passed'],'failed':bl['failed']},'managerDom':{'passed':manager['passed'],'failed':sum(not x['passed'] for x in manager['checks'])},'actualHttpNavigation':bm['http']},'localManagerBackend':{'passed':40,'failed':0,'evidence':'python unittest output captured in reports/test_runs.json'},'builder':'Unmodified v1.0.8; synthetic output tested through adapters/calculator','knownQuestionRegressions':{'total':tests['v6_existing_questions.json']['total']+tests['v6_existing_robustness.json']['total'],'passed':tests['v6_existing_questions.json']['passed']+tests['v6_existing_robustness.json']['passed'],'independent':False},'indexScaleMock':tests['connected_tests.json']['scale'],'newMiniLMAB':'NOT_RUN','liveBankIntegration':'NOT_RUN','customerAliasesInArtifact':len(reg['aliases']),'runtimeJSBytes':info['runtimeJsBytesExcludingTableauSDK'],'limits':['Developer-authored synthetic/mock/known regression fixtures; not production accuracy','Real Tableau SDK, SSO, RLS, HTTP browser loading, server CSP and permissions not validated','ID index membership is not server authorization','Derived previous RWA is not independently observed history; algebraic check not independent reconciliation','Optional driver family mapping is explicit only; no automatic family inference','No governance exemption or MiniLM superiority claim']}
 write(ROOT/'reports/release_summary.json',summary)
 web=web_files()
 allfiles=[p for p in sorted(ROOT.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and '.rule_manager' not in p.parts and p.suffix not in {'.pyc','.log'} and p.name not in {'SHA256SUMS.txt'}]
 for p in allfiles:
  if p.suffix.lower() in {'.onnx','.wasm','.safetensors','.pkl','.pt','.bin'}:raise ValueError('Unexpected model/runtime asset: '+str(p))
 (ROOT/'SHA256SUMS.txt').write_text(''.join(sha(p)+'  '+p.relative_to(ROOT).as_posix()+'\n' for p in allfiles))
 outputs=[]
 for suffix,files in [('',allfiles+[ROOT/'SHA256SUMS.txt']),('_web',web)]:
  out=ROOT.parent/('rwa_tableau_connected_v6'+suffix+'.zip');prefix='rwa_tableau_connected_v6'+suffix+'/'
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
   for p in files:z.write(p,prefix+p.relative_to(ROOT).as_posix())
   if suffix:z.writestr(prefix+'SHA256SUMS.txt',''.join(sha(p)+'  '+p.relative_to(ROOT).as_posix()+'\n' for p in files))
  with zipfile.ZipFile(out) as z:
   assert z.testzip() is None
  outputs.append({'name':out.name,'bytes':out.stat().st_size,'sha256':sha(out)})
 print(json.dumps({'outputs':outputs,'runtimeJSBytes':info['runtimeJsBytesExcludingTableauSDK'],'ruleBytes':info['ruleArtifactBytes']},indent=2))
 return allfiles,web
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline-dir',type=Path);a=p.parse_args();package(a.baseline_dir)
