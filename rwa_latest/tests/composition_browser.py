"""Actual bundled browser path with synthetic data; NOT live Tableau/SSO UAT."""
from pathlib import Path
import base64, hashlib, json, sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_standalone
original=build_standalone.bundle(ROOT,True)
js=original.replace('globalThis.RWA_APP_READY=',"config.compositionMode='guarded';config.answerMaxDurationMs=1;globalThis.RWA_APP_READY=")
h=lambda text:base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
html=build_standalone.make_html(ROOT,True).replace(original,js).replace('sha256-'+h(original),'sha256-'+h(js))
checks=[]
def check(name,condition):
    checks.append({'name':name,'passed':bool(condition)})
    if not condition:raise AssertionError(name)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    try:
        page.set_content(html);page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=20000)
        check('Existing app startup completes',page.locator('#status').inner_text().startswith('Ready'))
        def submit(question):
            count=page.evaluate("() => [...document.querySelectorAll('#history pre.debug')].filter(p=>{try{return JSON.parse(p.textContent).status==='answered'}catch{return false}}).length")
            page.locator('#question').fill(question)
            page.locator('#question').press('Enter')
            page.wait_for_selector('.confirm-report:not([disabled])',timeout=15000)
            preview=json.loads(page.locator('.plan-preview').last.locator('pre.debug').inner_text()) if page.locator('.plan-preview').last.locator('pre.debug').count() else None
            page.locator('.confirm-report:not([disabled])').last.click()
            page.wait_for_function("n => [...document.querySelectorAll('#history pre.debug')].filter(p=>{try{return JSON.parse(p.textContent).status==='answered'}catch{return false}}).length > n",arg=count)
            page.wait_for_timeout(150)
            return page.evaluate("() => [...document.querySelectorAll('#history pre.debug')].map(p=>{try{return JSON.parse(p.textContent)}catch{return {}}}).filter(x=>x.status==='answered').at(-1)")
        first=submit('What triggered Samsung RWA increase in July 2026?')
        check('New expression routes, previews and executes',first['ok'] and first['plan']['groupId']=='CG0001')
        check('Browser used the composition grammar',first['explain']['composition']['grammar']['valid'])
        second=submit('Same but exclude EAD')
        check('Typed context modifier executes existing exclusion',second['ok'] and second['plan']['excludedDrivers']==['EAD'])
        check('Exclusion warning remains visible',any('not a constant-factor' in w for w in second['warnings']))
        count=page.locator('.confirm-report').count()
        page.locator('#question').fill('Same but exclude EAD only');page.locator('#question').press('Enter');page.wait_for_timeout(500)
        check('Unsupported qualifier does not receive a preview',page.locator('.confirm-report').count()==count)
        check('No JavaScript page errors',not errors)
        out=ROOT/'reports';out.mkdir(exist_ok=True)
        page.screenshot(path=str(out/'composition_browser.png'),full_page=True)
    finally:
        browser.close()
        (ROOT/'reports/composition_browser.json').write_text(json.dumps({'scope':'Chromium bundled actual UI + synthetic provider; not live Tableau/SSO.','passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks':checks,'pageErrors':errors},indent=2)+'\n')
print(json.dumps({'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}))
