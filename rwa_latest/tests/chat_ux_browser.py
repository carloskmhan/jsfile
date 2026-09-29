"""Real current app/parser/engine in Chromium with synthetic sample + delay hooks.
The HTML is a bundled in-memory document. Not a bank Tableau/SSO integration test.
"""
from pathlib import Path
import sys,hashlib,base64,json,time,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports'/'chat_ux';OUT.mkdir(parents=True,exist_ok=True);OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'tools'));import build_standalone
original=build_standalone.bundle(ROOT,True)
js=original.replace("async refreshCatalog(){ensure();return catalog;}","async refreshCatalog(){if(globalThis.__UI_TEST?.readDelay)await new Promise(r=>setTimeout(r,__UI_TEST.readDelay));ensure();return catalog;}")
js=js.replace("async verifyCatalog(){ensure();return signature;}","async verifyCatalog(){globalThis.__UI_TEST.verifyCalls++;if(__UI_TEST.verifyDelay)await new Promise(r=>setTimeout(r,__UI_TEST.verifyDelay));if(__UI_TEST.fail)throw new Error('Synthetic verification failure');ensure();return signature;}")
js=js.replace('globalThis.RWA_APP_READY=',"globalThis.__UI_TEST={readDelay:0,verifyDelay:0,verifyCalls:0,fail:false};Object.assign(config,{answerCharsPerSecond:100,answerMaxDurationMs:5000});\nglobalThis.RWA_APP_READY=")
html=build_standalone.make_html(ROOT,True).replace(original,js)
h=lambda s:base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
html=html.replace('sha256-'+h(original),'sha256-'+h(js))
checks=[];errors=[]
def mark(n,ok=True,detail=None):
 checks.append({'name':n,'passed':bool(ok),'detail':detail})
 if not ok:raise AssertionError(n+': '+str(detail))
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1000})
 page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.set_content(html);page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=20000)
  mark('Application ready with existing startup splash',page.locator('#status').inner_text().startswith('Ready'))
  mark('Exactly 20 sidebar examples',page.locator('#example-list .rwa-example').count()==20)
  mark('Desktop sidebar is visible',page.locator('#example-panel').is_visible())
  page.locator('#example-list .rwa-example').first.click()
  mark('Example fills composer without submitting',page.locator('#question').input_value().startswith('Show top 10 groups') and page.locator('#history article').count()==0)
  page.screenshot(path=str(OUT/'01_sidebar_desktop.png'))
  # Seed only presentational history so submission begins far from its end.
  page.evaluate("""() => {const h=document.querySelector('#history');for(let i=0;i<20;i++){const a=document.createElement('article');a.className='assistant';a.textContent='Synthetic earlier report '+i+'\\n'+('Earlier report details. '.repeat(30));h.append(a);}window.scrollTo(0,0);__UI_TEST.readDelay=650;document.querySelector('#question').value='Top 10 groups in July';document.querySelector('#form').requestSubmit();}""")
  page.wait_for_timeout(140)
  rect=page.locator('#history article.user').last.bounding_box();foot=page.locator('body > footer').bounding_box()
  mark('Submitted question visible before data response',rect['y']>=0 and rect['y']+rect['height']<=foot['y'],{'user':rect,'footer':foot})
  page.screenshot(path=str(OUT/'02_auto_scroll_submitted.png'))
  page.wait_for_selector('.confirm-report:not([disabled])')
  action=page.locator('.plan-preview').last
  a=action.locator('.confirm-report').bounding_box();c=action.locator('.cancel-report').bounding_box()
  mark('Run and Cancel share exact top and height',abs(a['y']-c['y'])<.5 and abs(a['height']-c['height'])<.5,{'run':a,'cancel':c})
  page.screenshot(path=str(OUT/'03_aligned_buttons.png'))
  page.evaluate('__UI_TEST.verifyDelay=700')
  action.locator('.confirm-report').click();page.wait_for_selector('.confirm-report.is-running .rwa-report-spinner')
  mark('Run spinner and label present during validation','Running' in action.locator('.confirm-report').inner_text())
  mark('Cancel disabled while report is executing',action.locator('.cancel-report').is_disabled())
  a=action.locator('.confirm-report').bounding_box();c=action.locator('.cancel-report').bounding_box()
  mark('Alignment preserved when spinner is present',abs(a['y']-c['y'])<.5 and abs(a['height']-c['height'])<.5)
  page.screenshot(path=str(OUT/'04_running_aligned.png'))
  page.wait_for_selector('.rwa-typing-text')
  before=page.locator('.rwa-typing-text').inner_text();page.wait_for_timeout(220);after=page.locator('.rwa-typing-text').inner_text()
  mark('Successful answer is progressively revealed',len(after)>len(before) and len(before)<200,{'firstLength':len(before),'nextLength':len(after)})
  page.screenshot(path=str(OUT/'05_typing.png'))
  mark('Show full answer control is available',page.locator('.rwa-show-full').count()==1)
  page.locator('.rwa-show-full').click();mark('Skip displays complete report',page.locator('.rwa-typing-text').count()==0 and 'Group ID:' in page.locator('#history article.assistant').last.inner_text())
  mark('Group-ID table remains present after typing',page.locator('#history article.assistant').last.locator('th').all_text_contents()[1]=='Group ID')
  mark('Only one confirmation occurred',page.evaluate('__UI_TEST.verifyCalls')==1)
  # Test typing + manual scroll opt-out.
  page.evaluate("__UI_TEST.readDelay=0;__UI_TEST.verifyDelay=0;document.querySelector('#question').value='Top 20 groups in July';document.querySelector('#form').requestSubmit()")
  page.wait_for_selector('#history article.assistant:last-child .confirm-report:not([disabled])')
  page.locator('#history article.assistant').last.locator('.confirm-report').click();page.wait_for_selector('.rwa-typing-text')
  page.evaluate("window.dispatchEvent(new WheelEvent('wheel',{deltaY:-500}));window.scrollTo(0,0)")
  page.wait_for_timeout(350)
  mark('Manual scroll up is respected during typing',page.evaluate('window.scrollY')<10)
  mark('Jump to latest appears after scrolling up',page.locator('#jump-latest').is_visible())
  page.locator('#jump-latest').click();page.wait_for_timeout(100);mark('Jump to latest resumes following',page.evaluate('window.scrollY')>100)
  page.locator('.rwa-show-full').click()
  # Error and recovery presentation.
  page.evaluate("__UI_TEST.fail=true;document.querySelector('#question').value='Top 10 groups in July';document.querySelector('#form').requestSubmit()")
  page.wait_for_selector('#history article.assistant:last-child .confirm-report:not([disabled])')
  page.locator('#history article.assistant').last.locator('.confirm-report').click()
  page.wait_for_function("() => !document.querySelector('#ask').disabled")
  last=page.locator('#history article.assistant').last
  mark('Errors show immediately, never typed',last.locator('.rwa-typing-text').count()==0 and 'Synthetic verification failure' in last.inner_text())
  mark('No spinner stuck after failure',last.locator('.rwa-report-spinner').count()==0)
  # New action end-to-end through existing request, preview, confirm, engine.
  page.evaluate("__UI_TEST.fail=false;document.querySelector('#question').value='Show top 10 groups by lowest monthly percentage change over all history';document.querySelector('#form').requestSubmit()")
  page.wait_for_selector('#history article.assistant:last-child .confirm-report:not([disabled])')
  last=page.locator('#history article.assistant').last
  mark('History preview explains selection and source','Lowest month per group' in last.inner_text() and 'Derived previous RWA excluded' in last.inner_text())
  last.locator('.confirm-report').click();page.wait_for_selector('.rwa-show-full');page.locator('.rwa-show-full').click()
  mark('Historical report executes via normal confirmation','Peak month' in last.inner_text() and 'MoM change (%)' in last.inner_text())
  page.screenshot(path=str(OUT/'06_historical_result.png'))
  # New chat cancels timers so delayed fragments cannot repopulate deleted history.
  page.evaluate("document.querySelector('#question').value='Top 10 groups in July';document.querySelector('#form').requestSubmit()")
  page.wait_for_selector('#history article.assistant:last-child .confirm-report:not([disabled])');page.locator('#history article.assistant').last.locator('.confirm-report').click();page.wait_for_selector('.rwa-typing-text')
  page.locator('#newchat').click();page.wait_for_timeout(250)
  mark('New chat cancels old typing and content callbacks',page.locator('#history article').count()==0 and page.locator('.rwa-show-full').count()==0)
  # Viewport-dependent drawer does not cover mobile permanently.
  page.set_viewport_size({'width':430,'height':932});page.wait_for_timeout(100)
  mark('Mobile sidebar initially closed',not page.locator('#example-panel').is_visible())
  page.locator('#examples-toggle').click();mark('Mobile Examples opens drawer',page.locator('#example-panel').is_visible())
  page.screenshot(path=str(OUT/'07_mobile_examples.png'))
  page.locator('#example-list .rwa-example').nth(4).click()
  mark('Mobile example fills question and closes drawer',not page.locator('#example-panel').is_visible() and 'highest monthly' in page.locator('#question').input_value())
  mark('Mobile page does not overflow horizontally',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
  page.click('#ask');page.wait_for_selector('#history article.assistant:last-child .confirm-report:not([disabled])')
  ar=page.locator('#history article.assistant').last
  ra=ar.locator('.confirm-report').bounding_box();ca=ar.locator('.cancel-report').bounding_box()
  mark('Mobile Run and Cancel remain aligned',abs(ra['y']-ca['y'])<.5 and abs(ra['height']-ca['height'])<.5)
  ar.locator('.cancel-report').click()
  mark('Cancel does not leave a spinner',ar.locator('.rwa-report-spinner').count()==0)
  mark('No JavaScript exceptions',not errors,errors)
  # Accessibility preference disables the typing animation only, not data checks.
  reduced=b.new_page(viewport={'width':1280,'height':900},reduced_motion='reduce');reduced.set_content(html);reduced.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=20000)
  reduced.fill('#question','Top 10 groups in July');reduced.click('#ask');reduced.wait_for_selector('.confirm-report:not([disabled])');reduced.click('.confirm-report');reduced.wait_for_function("() => !document.querySelector('#ask').disabled")
  mark('Reduced-motion preference gets full answer immediately',reduced.locator('.rwa-typing-text').count()==0 and 'Group ID:' in reduced.locator('#history article.assistant').last.inner_text())
  reduced.close()
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'),full_page=True)
  raise
 finally:
  (OUT/'browser_chat_report.json').write_text(json.dumps({'scope':'Chromium DOM with real bundled application, rules and engine, synthetic sample and delay/failure hooks. No bank Tableau/SSO.','checks':checks,'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'errors':errors},indent=2));b.close()
print(json.dumps({'passed':sum(x['passed'] for x in checks),'total':len(checks)}))
