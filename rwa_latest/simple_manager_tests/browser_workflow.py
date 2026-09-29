"""Browser workflows + real compiler/filesystem via an IN-MEMORY test binding.
Not a claim of full browser localhost navigation, bank SSO or production UAT.
"""
from pathlib import Path
import sys,tempfile,shutil,json,hashlib,time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from simple_manager_tests.dom_harness import make_html,DirectBackend
from playwright.sync_api import sync_playwright
REPORT=ROOT/'simple_manager_reports';REPORT.mkdir(exist_ok=True)
checks=[];errors=[];requests=[]
def mark(name,ok=True,detail=None):
 checks.append({'name':name,'passed':bool(ok),'detail':detail})
 if not ok:raise AssertionError(name+': '+str(detail))
with tempfile.TemporaryDirectory(prefix='rwa-simple-ui-') as td:
 root=Path(td)/'project';shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__','.rule_manager','simple_manager_reports'))
 backend=DirectBackend(root);before=backend.w.read_bytes_map()
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'))
  page=browser.new_page(viewport={'width':1440,'height':1080},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.on('dialog',lambda d:d.accept())
  page.expose_function('__localTestCall',backend.call)
  def wait_home():page.wait_for_function("() => document.querySelectorAll('.capability').length>0 && !document.querySelector('#add-capability').disabled",timeout=30000)
  def pick_kind(kind):
   radio=page.locator('input[name="report-kind"][value="'+kind+'"]')
   if not radio.is_visible():page.locator('.more-options summary').click()
   radio.check()
  def to_review(q,kind,measure='question',title=None,edit=None,default=False):
   if edit:
    page.locator('article.capability').filter(has=page.locator('h3',has_text=edit)).locator('.edit-button').click()
   else:page.click('#add-capability')
   page.fill('#representative',q)
   if title:
    page.locator('.optional-name summary').click();page.fill('#capability-title',title)
   page.click('#wizard-next');pick_kind(kind);page.click('#wizard-next')
   if page.locator('#measure').count():page.select_option('#measure',measure)
   if default and page.locator('#number-mode').count():page.select_option('#number-mode','default')
   page.click('#wizard-next');page.click('#wizard-next')
   page.wait_for_function("() => !document.querySelector('#wizard-back').disabled",timeout=60000)
   return page.locator('#wizard-next').is_enabled()
  def save():page.click('#wizard-next');page.wait_for_function("() => !document.querySelector('#wizard').open",timeout=40000);wait_home()
  def delete(title):
   page.locator('article.capability').filter(has=page.locator('h3',has_text=title)).locator('.delete-button').click();page.click('#confirm-delete');page.wait_for_function("() => !document.querySelector('#delete-dialog').open",timeout=40000);wait_home()
  try:
   page.set_content(make_html(ROOT));wait_home()
   mark('Home lists current capabilities',page.locator('.capability').count()==20)
   mark('Default home hides implementation fields',not any(w in page.locator('#home').inner_text() for w in ['required_slots','primary_features','min_confidence','grammar ID','synonyms.csv']))
   mark('Opening manager does not rewrite CSVs',before==backend.w.read_bytes_map())
   page.screenshot(path=str(REPORT/'01_home.png'),full_page=True)
   page.fill('#search','offsetting');mark('Search filters capabilities',page.locator('.capability').count()==1);page.fill('#search','zzzzzz');mark('Search has empty state',page.locator('#empty-search').is_visible());page.fill('#search','')
   page.click('#add-capability');mark('Add opens step-by-step wizard',page.locator('#step-label').inner_text()=='Step 1 of 5')
   page.screenshot(path=str(REPORT/'02_add_question.png'))
   page.fill('#representative',"Take me through Samsung's RWA movement in July.");page.locator('.optional-name summary').click();page.fill('#capability-title','Movement walkthrough');page.click('#wizard-next');pick_kind('movement');page.click('#wizard-next');page.select_option('#measure','question');mark('Details contain only relevant settings',page.locator('#number-mode').count()==0)
   page.click('#wizard-next');page.click('#wizard-next');page.wait_for_function("() => !document.querySelector('#wizard-back').disabled",timeout=60000)
   mark('Unknown phrase is mapped and checked by real engine',page.locator('#wizard-next').is_enabled(),page.locator('#wizard-error').inner_text());mark('Compiler ran but saved files unchanged before Save',before==backend.w.read_bytes_map())
   page.screenshot(path=str(REPORT/'03_review.png'))
   save();mark('Save updates CSV and generated artifact',backend.w.read_snapshot()['artifactConsistent'] and 'take me through' in (root/'command_patterns.txt').read_text());mark('New card appears',page.locator('#capability-list h3',has_text='Movement walkthrough').count()==1)
   mark('Save created a recoverable backup',len(backend.w.list_backups())==1)
   page.click('#test-engine');page.fill('#test-question',"Take me through Samsung's RWA movement in July.");page.click('#check-question');mark('Test uses real parser',page.locator('#result-title').inner_text()=='✓ Understood');mark('Test displays friendly target and period','SAMSUNG GROUP' in page.locator('#meaning-grid').inner_text() and 'July 2026' in page.locator('#meaning-grid').inner_text())
   page.screenshot(path=str(REPORT/'04_test_engine.png'))
   snap=backend.w.read_bytes_map();page.click('#looks-right');mark('Looks right does not change rules',snap==backend.w.read_bytes_map());page.fill('#test-question','How about Toyota?');page.click('#check-question');mark('Follow-up inherits month but changes group','TOYOTA GROUP' in page.locator('#meaning-grid').inner_text() and 'July 2026' in page.locator('#meaning-grid').inner_text());page.click('#looks-right')
   page.fill('#test-question','Guide me through Samsung RWA increase in July.');page.click('#check-question');mark('Unknown expression offers Fix interpretation',page.locator('#fix-interpretation').is_visible() and not page.locator('#looks-right').is_visible());page.click('#fix-interpretation');page.click('#wizard-next');pick_kind('movement');page.select_option('#fix-target','builtin:RWA_DRIVER');page.click('#wizard-next');page.click('#wizard-next');page.click('#wizard-next');page.wait_for_function("() => !document.querySelector('#wizard-back').disabled",timeout=60000)
   mark('Fix adds wording to an existing capability',page.locator('#wizard-next').is_enabled(),page.locator('#wizard-error').inner_text());save();mark('Fix changes real synonym source','guide me through' in (root/'rules/synonyms.csv').read_text())
   okay=to_review('Show top 10 groups by RWA increase in July','rank_groups','increase','Ranking shortcut');mark('Existing fully-understood example can be registered',okay,page.locator('#wizard-error').inner_text());save()
   okay=to_review('Show top 10 groups by higher RWA balance in July','rank_groups','highest','Balance ranking',edit='Ranking shortcut');mark('Edit reuses the same wizard and validates changed measure',okay,page.locator('#wizard-error').inner_text());save();mark('Edited card displays new measure',page.locator('#capability-list h3',has_text='Balance ranking').count()==1)
   okay=to_review('Take me through Toyota RWA movement in July','movement','question','Another walkthrough');mark('Shared expression can be reused',okay,page.locator('#wizard-error').inner_text());save()
   delete('Movement walkthrough');mark('Delete leaves shared expression intact','take me through' in (root/'command_patterns.txt').read_text());delete('Another walkthrough');mark('Last unused owned expression is cleaned up','take me through' not in (root/'command_patterns.txt').read_text());mark('Unrelated existing synonym preserved','what drove' in (root/'command_patterns.txt').read_text())
   before_bad=backend.w.read_bytes_map();okay=to_review('Show top 10 groups by higher RWA balance in July','rank_groups','increase','Contradictory example');mark('Wrong interpretation cannot be forced into rules',not okay);mark('Failed check leaves working artifact untouched',before_bad==backend.w.read_bytes_map());page.screenshot(path=str(REPORT/'05_safe_conflict.png'));page.click('#close-wizard')
   page.click('#test-engine');page.fill('#test-question','Predict Samsung RWA next year.');page.click('#check-question');mark('Unsupported forecast stays unsupported','✓' not in page.locator('#result-title').inner_text());page.click('#back-home')
   okay=to_review('Carry on for Toyota','follow_scope','question','Continue with another client');mark('New follow-up generated using existing patch grammar',okay,page.locator('#wizard-error').inner_text());save();mark('New follow-up is written to canonical CSV','carry on for {scope}' in (root/'rules/followups.csv').read_text())
   delete('Balance ranking');mark('Deleting a saved example does not disable shared ranking command',any(r['action']=='TOP_CLIENTS' and r['enabled']=='true' for r in backend.w.read_snapshot()['tables']['commands.csv']['rows']))
   delete('Show offsetting drivers');mark('Built-in Delete disables only that report',not any(r['action']=='OFFSETS' and r['enabled']=='true' for r in backend.w.read_snapshot()['tables']['commands.csv']['rows']))
   page.click('#test-engine');page.fill('#test-question','Show offsets for Samsung in July');page.click('#check-question');mark('Deleted report does not become a different report',page.locator('#result-title').inner_text()!='✓ Understood');page.click('#back-home')
   mark('Advanced workbench remains linked',page.locator('a[href="/advanced"]').count()>=1)
   page.set_viewport_size({'width':430,'height':932});page.screenshot(path=str(REPORT/'06_mobile_home.png'),full_page=True);mark('Mobile home has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
   page.click('#add-capability');page.screenshot(path=str(REPORT/'07_mobile_wizard.png'));mark('Mobile wizard fits viewport',page.locator('#wizard').bounding_box()['width']<=430);page.click('#close-wizard')
   mark('No browser JavaScript errors',not errors,errors);mark('No browser network forwarding or requests in DOM fixture',not requests,requests)
  finally:
   (REPORT/'browser_workflow.json').write_text(json.dumps({'kind':'Actual JS, real Python compiler/transaction methods through test-only direct binding; no browser HTTP requests. Localhost navigation was separately attempted and blocked by administrator policy. Not live bank UAT.','checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'errors':errors,'apiCalls':backend.calls},indent=2))
   browser.close()
 backend.close()
print(json.dumps({'passed':sum(c['passed'] for c in checks),'total':len(checks)}))
