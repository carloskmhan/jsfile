"""Actual application -> synthetic provider -> preview -> execute. Never live bank SSO."""
from pathlib import Path
import base64, hashlib, json, os, shutil, sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_standalone
original=build_standalone.bundle(ROOT,True)
js=original.replace('globalThis.RWA_APP_READY=',"config.compositionMode='guarded';config.answerMaxDurationMs=1;globalThis.RWA_APP_READY=")
h=lambda text:base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
html=build_standalone.make_html(ROOT,True).replace(original,js).replace('sha256-'+h(original),'sha256-'+h(js))
checks=[];errors=[];out=ROOT/'reports';out.mkdir(exist_ok=True)
def check(name,condition):
    checks.append({'name':name,'passed':bool(condition)})
    if not condition:raise AssertionError(name)
with sync_playwright() as pw:
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    browser=pw.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        page.set_content(html)
        page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=20000)
        check('Actual bundled application starts',page.locator('#status').inner_text().startswith('Ready'))
        def outputs():
            return page.evaluate("() => [...document.querySelectorAll('#history pre.debug')].map(p=>{try{return JSON.parse(p.textContent)}catch{return {}}})")
        def preview(q):
            page.locator('#question').fill(q);page.locator('#question').press('Enter')
            page.wait_for_selector('.confirm-report:not([disabled])',timeout=15000)
        def submit(q):
            count=sum(r.get('status')=='answered' for r in outputs());preview(q)
            page.locator('.confirm-report:not([disabled])').last.click()
            page.wait_for_function("n => [...document.querySelectorAll('#history pre.debug')].filter(p=>{try{return JSON.parse(p.textContent).status==='answered'}catch{return false}}).length>n",arg=count,timeout=15000)
            page.wait_for_function("() => !document.querySelector('#question').disabled")
            return [r for r in outputs() if r.get('status')=='answered'][-1]
        a=submit('What triggered Samsung RWA increase in July 2026?');check('6.1 lexical route still executes',a['ok'] and a['plan']['groupId']=='CG0001')
        a=submit('Same but exclude EAD');check('Existing driver exclusion established',a['plan']['excludedDrivers']==['EAD'])
        a=submit('Same analysis for Toyota in June 2026, but include EAD this time')
        check('Compound replacement loads the replacement group',a['plan']['groupId']=='CG0004')
        check('Compound replacement applies the specified month',a['plan']['period']=={'mode':'month','month':'2026-06'})
        check('Compound replacement clears only EAD exclusion',a['plan']['excludedDrivers']==[])
        check('Browser executes a pre-selection meaning frame',a['explain']['semanticPlanning']['stage']=='BEFORE_COMMAND_SELECTION')
        count=len([r for r in outputs() if r.get('status')=='answered']);preview('Same analysis for Samsung in July 2026 but exclude EAD')
        page.locator('.cancel-report:not([disabled])').last.click();page.wait_for_function("() => !document.querySelector('#question').disabled")
        check('Cancel does not execute the compound replacement',len([r for r in outputs() if r.get('status')=='answered'])==count)
        a=submit('Same analysis in July 2026 but exclude EAD');check('Cancelled group was not committed',a['plan']['groupId']=='CG0004')
        old=page.locator('.confirm-report').count();n=len(outputs())
        page.locator('#question').fill('Same analysis for Samsung in June 2026 but exclude EAD only');page.locator('#question').press('Enter')
        page.wait_for_function("n => document.querySelectorAll('#history pre.debug').length > n",arg=n)
        page.wait_for_function("() => !document.querySelector('#question').disabled")
        check('Invalid extra qualifier never receives a preview',page.locator('.confirm-report').count()==old)
        r=outputs()[-1];check('Targeted clarification is displayed',not r.get('ok') and r.get('explain',{}).get('clarification',{}).get('preservesSuccessfulContext'))
        a=submit('Same analysis in June 2026 but include EAD');check('Rejected replacement did not change the group',a['plan']['groupId']=='CG0004')
        a=submit('Show top 5 groups by percentage increase in July 2026, excluding groups with RWA below 25m')
        check('Actual portfolio route reaches the new planner',a['ok'] and a['plan']['action']=='TOP_CLIENTS')
        check('Rank and filter measures remain different at execution',a['plan']['metric']=='PERCENT' and a['plan']['condition']['metric']=='BALANCE')
        check('Predicate complement is preserved through confirmation',a['plan']['condition']['op']=='GTE')
        check('No JavaScript page errors',not errors)
        page.screenshot(path=str(out/'semantic_planning_browser.png'),full_page=True)
    finally:
        browser.close()
        (out/'semantic_planning_browser.json').write_text(json.dumps({'scope':'Actual Chromium UI and bundled application with synthetic provider; not live Tableau/SSO.','passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks':checks,'pageErrors':errors},indent=2)+'\n')
print(json.dumps({'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}))
