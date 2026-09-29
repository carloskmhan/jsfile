"""Historical capability wizard using real compiler on a disposable workspace."""
from pathlib import Path
import sys,tempfile,shutil,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from simple_manager_tests.dom_harness import make_html,DirectBackend
from playwright.sync_api import sync_playwright
OUT=ROOT/'reports'/'chat_ux';OUT.mkdir(parents=True,exist_ok=True);checks=[]
def mark(n,b=True):
 checks.append({'name':n,'passed':bool(b)})
 if not b:raise AssertionError(n)
with tempfile.TemporaryDirectory() as td:
 root=Path(td)/'project';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__','.rule_manager','reports','validation_history'))
 backend=DirectBackend(root)
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=b.new_page(viewport={'width':1440,'height':1000});page.on('dialog',lambda d:d.accept());page.expose_function('__localTestCall',backend.call)
  try:
   page.set_content(make_html(ROOT));page.wait_for_selector('.capability');page.wait_for_function("()=>!document.querySelector('#add-capability').disabled")
   mark('Historical ranking is present as a capability card',page.locator('.capability h3',has_text='historical monthly percentage').count()==1)
   page.click('#add-capability');page.fill('#representative','Survey groups by highest monthly percentage change over all history');page.locator('.optional-name summary').click();page.fill('#capability-title','Historical percentage review');page.click('#wizard-next');page.locator('.more-options summary').click();page.check('input[value="historical_peak_groups"]');page.click('#wizard-next')
   mark('New detail options use human-readable high/low choices',page.locator('#measure').locator('option').all_text_contents()==['Highest monthly percentage change','Lowest monthly percentage change','As stated in the question'])
   page.select_option('#number-mode','default');page.select_option('#period-mode','history');page.click('#wizard-next');page.click('#wizard-next');page.wait_for_function("()=>!document.querySelector('#wizard-back').disabled",timeout=60000)
   mark('New expression validates with the actual engine',page.locator('#wizard-next').is_enabled())
   mark('Review explains selected month and amount basis','Change in that selected month' in page.locator('#review-meaning').inner_text())
   page.screenshot(path=str(OUT/'08_historical_wizard.png'));page.click('#wizard-next');page.wait_for_function("()=>!document.querySelector('#wizard').open",timeout=60000)
   mark('Save publishes the phrase in canonical CSV','survey' in (root/'rules/synonyms.csv').read_text())
   page.click('#test-engine');page.fill('#test-question','Survey groups by lowest monthly percentage change over all history');page.click('#check-question');mark('Saved generic wording preserves the explicit lowest selection','Minimum eligible monthly percentage per group' in page.locator('#meaning-grid').inner_text());page.click('#looks-right')
   mark('Local calculation succeeds','No rules were changed' in page.locator('#test-notice').inner_text())
   page.click('#back-home');page.locator('.capability').filter(has=page.locator('h3',has_text='Historical percentage review')).locator('.edit-button').click();page.click('#wizard-next');page.click('#wizard-next');page.select_option('#measure','peak_low');page.click('#wizard-next');page.locator('#example-list textarea').first.fill('Survey groups by lowest monthly percentage change over all history');page.click('#wizard-next');page.wait_for_function("()=>!document.querySelector('#wizard-back').disabled",timeout=60000)
   mark('Edit reuses wizard and validates lowest wording',page.locator('#wizard-next').is_enabled());page.click('#wizard-next');page.wait_for_function("()=>!document.querySelector('#wizard').open",timeout=60000)
   page.locator('.capability').filter(has=page.locator('h3',has_text='Historical percentage review')).locator('.delete-button').click();page.click('#confirm-delete');page.wait_for_function("()=>!document.querySelector('#delete-dialog').open",timeout=60000)
   mark('Delete cleans owned phrase but retains underlying report','survey' not in (root/'rules/synonyms.csv').read_text() and 'HISTORICAL_PEAK_GROUPS' in (root/'rules/commands.csv').read_text())
  finally:
   (OUT/'history_manager_browser.json').write_text(json.dumps({'scope':'Actual current browser parser and Python compiler/transactions through test-only in-memory binding; not localhost HTTP or bank SSO.','passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks':checks},indent=2));b.close()
 backend.close()
print(json.dumps({'passed':sum(c['passed'] for c in checks),'total':len(checks)}))
