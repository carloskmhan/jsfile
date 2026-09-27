"""Real browser parser checks for wizard suggestions and unsafe mapping refusal."""
from pathlib import Path
import sys,shutil,tempfile,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from simple_manager_tests.dom_harness import make_html,DirectBackend
from playwright.sync_api import sync_playwright
with tempfile.TemporaryDirectory(prefix='rwa-simple-logic-') as td:
 root=Path(td)/'project';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__','.rule_manager','simple_manager_reports'))
 api=DirectBackend(root)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'));page=browser.new_page();page.expose_function('__localTestCall',api.call);page.set_content(make_html(ROOT));page.wait_for_selector('.capability')
  data=page.evaluate('''async()=>{
   const a=await(await fetch('/api/test-assets')).json(),s=await(await fetch('/api/bootstrap')).json(),c=await(await fetch('/api/capabilities')).json(),m=__TEST_MODULES['local_manager/simple_logic.js'];
   const lab=m.newLab(a,s.generatedText,s.artifactHash),ctx=m.defaultContext(lab),out=[];
   for(const key of ['rank_groups','rank_entities'])for(const measure of ['increase','decrease','highest','lowest','percentage','question'])for(const numberMode of ['question','default'])for(const periodMode of ['question','previous','current','last3']){
    const r=c.recipes.find(x=>x.key===key),d={measure,numberMode,exampleNumber:10,periodMode},q=m.suggestion(r,d),p=lab.engine.parseQuestion(q,ctx),error=m.checkMeaning(p,r,d,q,ctx,c.defaultNumber);out.push({kind:'supported suggestion',query:q,pass:!error,error});
   }
   for(const key of ['movement','direction_check'])for(const measure of ['increase','decrease']){
    const r=c.recipes.find(x=>x.key===key),d={measure,numberMode:'question',exampleNumber:10,periodMode:'question'},q=m.suggestion(r,d),p=lab.engine.parseQuestion(q,ctx),error=m.checkMeaning(p,r,d,q,ctx,c.defaultNumber);out.push({kind:'supported suggestion',query:q,pass:!error,error});
   }
   for(const q of ['Explain Novelco RWA in July','Why did Unlistedco RWA rise in July','Show Novelco RWA in July','Predict Samsung RWA next year','Tell me a joke','Take me through Samsung RWA in Jully','Take me through Samsung RWA above 25 miloin']){
    const r=c.recipes.find(x=>x.key==='movement'),d={measure:'question',numberMode:'question',exampleNumber:10,periodMode:'question'};let accepted=false,code='';try{m.proposeExamples(lab,r,d,[q],ctx);accepted=true;}catch(e){code=e.code;}
    out.push({kind:'unsupported/name/numeric safety',query:q,pass:!accepted,code});
   }
   for(const q of ['Take me through Samsung RWA movement in July','Kindly unpack Samsung RWA movement in July']){
    const r=c.recipes.find(x=>x.key==='movement'),d={measure:'question',numberMode:'question',exampleNumber:10,periodMode:'question'};try{const p=m.proposeExamples(lab,r,d,[q],ctx);out.push({kind:'request prefix isolation',query:q,pass:!!p[0].phrase,phrase:p[0].phrase});}catch(e){out.push({kind:'request prefix isolation',query:q,pass:false,error:e.message});}
   }
   const r=c.recipes.find(x=>x.key==='rank_groups'),d={measure:'highest',numberMode:'question',exampleNumber:10,periodMode:'question'},q='Top 10 groups by highest RWA in July',p=lab.engine.parseQuestion(q,ctx);
   out.push({kind:'do not mislabel automatic sorting',query:q,pass:!!m.checkMeaning(p,r,d,q,ctx,c.defaultNumber)&&m.humanPlan(p,q).some(x=>x[0]==='Order'&&x[1].startsWith('Automatic'))});
   return {checks:out,passed:out.filter(x=>x.pass).length,failed:out.filter(x=>!x.pass).length};
  }''')
  browser.close()
 api.close()
 data['scope']='Developer-authored manager helper checks in Chromium, unchanged real parser; no new runtime rules, no bank API.'
 (ROOT/'simple_manager_reports/browser_logic.json').write_text(json.dumps(data,indent=2))
 print(json.dumps({k:data[k] for k in ['passed','failed']}))
 for r in data['checks']:
  if not r['pass']:print(r)
 if data['failed']:sys.exit(1)
