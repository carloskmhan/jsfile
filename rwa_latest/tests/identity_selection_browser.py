"""Actual bundled app with synthetic group/client collisions. Not bank Tableau/SSO UAT."""
from pathlib import Path
import base64, csv, hashlib, io, json, os, shutil, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_standalone
OUT=ROOT/'reports';OUT.mkdir(exist_ok=True)
checks=[];errors=[]
def check(name,condition):
    checks.append({'name':name,'passed':bool(condition)})
    if not condition:raise AssertionError(name)
def fixture():
    groups=[('G001','NORTHBRIDGE BANK LIMITED',[('E001','NORTHBRIDGE BANK LIMITED'),('E001-1','NORTHBRIDGE BANK LIMITED')]),
        ('G002','TWIN HOLDINGS',[('E002','TWIN CLIENT')]),('G003','TWIN HOLDINGS',[('E002','TWIN CLIENT')]),
        ('G004','SOUTHBRIDGE GROUP',[('E004','SOUTHBRIDGE OPERATIONS')])]
    groups += [(f'P{i:03}','SHARED GROUP',[(f'PE{i:03}','SHARED OPERATIONS')]) for i in range(12)]
    s=io.StringIO(newline='');w=csv.writer(s);w.writerow(['client_group_id','client_group_name','group_location','json_data'])
    for idx,(gid,name,entities) in enumerate(groups):
        rows=[{'entity_id':eid,'entity':ename,'month':month,'rwa_prev':100+idx,'rwa_curr':120+idx+j*5,'drivers':{'EAD':12,'FX':8+j*5}}
            for eid,ename in entities for j,month in enumerate(['2026-06','2026-07'])]
        w.writerow([gid,name,'SYNTHETIC',json.dumps({'rows':rows})])
    return s.getvalue()
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)/'app';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('reports','__pycache__','.git'))
    (root/'tableau_sample.csv').write_text(fixture())
    original=build_standalone.bundle(root,True)
    js=original.replace('globalThis.RWA_APP_READY=',"config.compositionMode='guarded';config.answerMaxDurationMs=1;globalThis.RWA_APP_READY=")
    js=js.replace('provider.onContextChanged(sourceChanged);','provider.onContextChanged(sourceChanged);globalThis.IDENTITY_TEST_PROVIDER=provider;globalThis.IDENTITY_TEST_SOURCE_CHANGED=sourceChanged;')
    h=lambda x:base64.b64encode(hashlib.sha256(x.encode()).digest()).decode()
    html=build_standalone.make_html(root,True).replace(original,js).replace('sha256-'+h(original),'sha256-'+h(js))
    with sync_playwright() as pw:
        executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        browser=pw.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True)
        page=browser.new_page(viewport={'width':1250,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            def start():
                page.set_content(html);page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=20000)
                page.evaluate("""() => {window.identityLoads=[];const p=IDENTITY_TEST_PROVIDER;const g=p.loadGroups.bind(p),a=p.loadPortfolio.bind(p);p.loadGroups=async ids=>{identityLoads.push([...ids]);return g(ids)};p.loadPortfolio=async()=>{identityLoads.push('PORTFOLIO');return a()}}""")
            def ready():page.wait_for_function("() => !document.querySelector('#question').disabled",timeout=20000)
            def outputs():return page.evaluate("() => [...document.querySelectorAll('#history pre.debug')].map(p=>JSON.parse(p.textContent))")
            def asked(q):
                ready();page.locator('#question').fill(q);page.locator('#question').press('Enter');ready()
            def preview_output():
                page.wait_for_selector('.confirm-report:not([disabled])',timeout=15000)
                return outputs()[-1]
            def execute():
                count=len([r for r in outputs() if r.get('status')=='answered'])
                page.locator('.confirm-report:not([disabled])').last.click()
                page.wait_for_function("n => [...document.querySelectorAll('#history pre.debug')].filter(p=>JSON.parse(p.textContent).status==='answered').length>n",arg=count,timeout=15000)
                ready();return outputs()[-1]
            def picker():return page.locator('.rwa-identity-picker').last
            def pick(key):
                picker().locator(f'button[data-identity-key="{key}"]').click();ready();return preview_output()
            start();check('Bundled app starts',page.locator('#status').inner_text().startswith('Ready'))
            asked('NORTHBRIDGE BANK')
            check('Post-load group/client ambiguity shows a list',picker().locator('.rwa-identity-choice').count()==3)
            check('Initial group-index resolution loads only the named group',page.evaluate('identityLoads')==[['G001']])
            check('Group and two LEIDs are separately labelled','Group ID: G001' in picker().inner_text() and 'LEID: E001-1' in picker().inner_text())
            check('No prose Specify one of dump', 'Specify one of:' not in page.locator('#history').inner_text())
            check('First identity receives keyboard focus',page.evaluate("document.activeElement.classList.contains('rwa-identity-choice')"))
            page.screenshot(path=str(OUT/'identity_choices_desktop.png'),full_page=True)
            page.set_viewport_size({'width':430,'height':1000})
            check('Mobile identity cards fit viewport',page.evaluate("[...document.querySelectorAll('.rwa-identity-choice')].every(b=>b.getBoundingClientRect().width<=innerWidth)"))
            page.screenshot(path=str(OUT/'identity_choices_mobile.png'),full_page=True)
            page.set_viewport_size({'width':1250,'height':1000})
            p=pick('ENTITY:G001/E001-1');check('Click opens preview for exact LEID',p['status']=='preview' and p['plan']['entityId']=='E001-1')
            check('Selecting a name does not execute a report',not any(r.get('status')=='answered' for r in outputs()))
            a=execute();check('Run report executes selected legal client',a['ok'] and a['plan']['entityId']=='E001-1')
            check('All consumed choice buttons stay disabled',page.locator('.rwa-identity-picker button:not([disabled])').count()==0)
            asked('Show top 5 groups by RWA increase in June 2026');preview_output();execute()
            asked('NORTHBRIDGE BANK');p=pick('GROUP:G001')
            check('Bare selected name after portfolio ranking opens group drill-down',p['plan']['action']=='GROUP_ROOT_CAUSE' and p['plan']['groupId']=='G001')
            check('Portfolio drill-down retains original ranking month',p['plan']['period']=={'mode':'month','month':'2026-06'})
            execute()
            asked('Explain NORTHBRIDGE BANK RWA increase in June 2026 excluding EAD')
            p=pick('GROUP:G001');check('Original month/action/exclusion survive selection',p['plan']['groupId']=='G001' and p['plan']['entityId'] is None and p['plan']['period']['month']=='2026-06' and p['plan']['excludedDrivers']==['EAD'])
            a=execute();check('Independent group result after selected exclusion',a['result']['change']==16)
            check('Checks prose hiding is preserved','Checks:' not in page.locator('#history article.assistant .message').last.inner_text())
            asked('TWIN HOLDINGS');n=len(page.evaluate('identityLoads'))
            check('Index-stage ambiguity offers group IDs before detail loading',picker().locator('.rwa-identity-choice').count()==2)
            p=pick('GROUP:G003');check('Selected duplicate name routes by ID only',page.evaluate('identityLoads')[n:]==[['G003']] and p['plan']['groupId']=='G003')
            before=len([r for r in outputs() if r.get('status')=='answered']);page.locator('.cancel-report:not([disabled])').last.click()
            check('Cancel after selecting a name does not calculate',len([r for r in outputs() if r.get('status')=='answered'])==before)
            asked('Southbridg');check('Bare partial name offers explicit selection even for one match',picker().locator('.rwa-identity-choice').count()==1)
            p=pick('GROUP:G004');check('Partial selection uses authorised ID',p['plan']['groupId']=='G004');page.locator('.cancel-report:not([disabled])').last.click()
            asked('SHARED GROUP');check('Candidate pages initially show eight',picker().locator('.rwa-identity-choice').count()==8)
            picker().get_by_role('button',name='Show more matches',exact=False).click();check('Show more exposes all twelve without truncation',picker().locator('.rwa-identity-choice').count()==12)
            picker().get_by_role('button',name='Edit question').click();check('Edit question restores wording and disables old list',page.locator('#question').input_value()=='SHARED GROUP' and picker().locator('button:not([disabled])').count()==0)
            asked('TWIN HOLDINGS');n=len(page.evaluate('identityLoads'))
            page.evaluate('IDENTITY_TEST_PROVIDER.version++')
            picker().locator('[data-identity-key="GROUP:G002"]').click();ready()
            check('Changed provider version expires selection without loading',len(page.evaluate('identityLoads'))==n and 'expired' in page.locator('#history article.assistant .message').last.inner_text())
            asked('TWIN HOLDINGS');n=len(page.evaluate('identityLoads'))
            picker().locator('[data-identity-key="GROUP:G002"]').evaluate("b => {const old=Date.now;Date.now=()=>old()+120001;try{b.click()}finally{Date.now=old}}")
            check('Expired name selection cannot load or execute',len(page.evaluate('identityLoads'))==n and 'expired' in page.locator('#history article.assistant .message').last.inner_text())
            asked('TWIN HOLDINGS');n=len(page.evaluate('identityLoads'))
            picker().locator('[data-identity-key="GROUP:G002"]').evaluate('b => {b.click();b.click()}');ready();preview_output()
            check('Double click triggers one selected data load',len(page.evaluate('identityLoads'))==n+1)
            page.locator('.cancel-report:not([disabled])').last.click()
            asked('TWIN HOLDINGS');page.locator('#question').fill('G001');check('Editing another question disables stale candidates',picker().locator('button:not([disabled])').count()==0)
            asked('TWIN HOLDINGS');page.evaluate("IDENTITY_TEST_SOURCE_CHANGED({reason:'Synthetic scope refresh'})");check('Scope refresh invalidates choices',picker().locator('button:not([disabled])').count()==0)
            asked('TWIN HOLDINGS');page.locator('#newchat').click();check('New chat removes pending choices',page.locator('.rwa-identity-picker').count()==0)
            # Test the render module in isolation for escaping. Data remains synthetic.
            escaped=page.evaluate("""() => {const a=document.createElement('article');document.body.append(a);RWA_TEST_MODULES['identity_choice_ui.js'].renderIdentityChoices(a,{reason:'AMBIGUOUS_NAME',span:{text:'demo'},targets:[{key:'GROUP:G',kind:'GROUP',id:'G',name:'<img src=x onerror=alert(1)>'}]},{});const ok=!a.querySelector('img')&&a.textContent.includes('<img');a.remove();return ok;}""")
            check('Candidate labels are rendered as text, never HTML',escaped)
            check('No JavaScript page errors',not errors)
        finally:
            browser.close()
            (OUT/'identity_selection_browser.json').write_text(json.dumps({'scope':'Actual Chromium bundled app and synthetic provider; not live Tableau/SSO.','passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks':checks,'pageErrors':errors},indent=2)+'\n')
print(json.dumps({'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}))
