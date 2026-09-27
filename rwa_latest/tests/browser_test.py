"""Actual local HTTP/module/fetch smoke test, plus standalone file test; no CSP bypass flags."""
from pathlib import Path
import json,os,subprocess,time,urllib.request,shutil,argparse,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'));from build_standalone import make_html

def run(mode="dom"):
 results=[];requests=[];errors=[];server=None
 def check(name,test):
  try:test();results.append({'test':name,'passed':True})
  except Exception as e:results.append({'test':name,'passed':False,'error':str(e)})
 def require(v,msg='Assertion failed'):
  if not v:raise AssertionError(msg)
 try:
  if mode=='http':
   server=subprocess.Popen(['node','serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'8765'},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   for _ in range(50):
    try:urllib.request.urlopen('http://127.0.0.1:8765/demo.html',timeout=1);break
    except Exception:time.sleep(.1)
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'))
   page=browser.new_page(viewport={'width':1200,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
   if mode=='http':page.goto('http://127.0.0.1:8765/demo.html')
   else:page.set_content(make_html(ROOT,test_mode=True))
   page.wait_for_function("document.querySelector('#status').textContent.startsWith('Ready')",timeout=20000)
   check('Actual local HTTP bootstrap' if mode=='http' else 'Bundled app initializes in-memory with generated rules',lambda:require('Ready' in page.locator('#status').inner_text()))
   def send(q,confirm=True):
    page.locator('#question').fill(q);page.locator('#ask').click()
    page.wait_for_function("!document.querySelector('#ask').disabled",timeout=20000)
    article=page.locator('article.assistant').last
    if confirm and article.locator('.confirm-report').count():article.locator('.confirm-report').click()
    return article
   a=send("Why did Samsung’s RWA increase in July?",False)
   check('Preview shows July before financial execution',lambda:require('2026-07' in a.locator('.plan-preview').inner_text() and 'decreased by' not in a.locator('.message').inner_text()))
   a.locator('.confirm-report').click()
   check('Confirmed Samsung July shows recorded decrease',lambda:require('decreased by $120m' in a.locator('.message').inner_text()))
   a=send('How about Toyota?')
   check('Toyota follow-up reloads data and keeps July',lambda:require("TOYOTA GROUP" in a.locator('.message').inner_text() and '$30m' in a.locator('.message').inner_text() and '2026-07' in a.locator('.message').inner_text()))
   a=send('And August?')
   check('Missing August returns no data instead of Samsung/Toyota prior values',lambda:require('No data for 2026-08' in a.locator('.message').inner_text()))
   a=send('Predict Toyota RWA next year')
   check('Unsupported query has no execution button',lambda:require(a.locator('.confirm-report').count()==0 and 'Unsupported' in a.locator('.message').inner_text()))
   a=send('Top 10 groups in June 2026')
   check('Portfolio ranking operates with original provider',lambda:require('SAMSUNG GROUP' in a.locator('.message').inner_text() and a.locator('table tr').count()==11))
   a=send('Only those above 25m')
   check('Portfolio result-set threshold patch',lambda:require('prior displayed group set' in a.locator('.message').inner_text()))
   a=send('Compare the first one with Toyota')
   check('Rank reference and Toyota both freshly fetched',lambda:require('SAMSUNG GROUP' in a.locator('.message').inner_text() and 'TOYOTA GROUP' in a.locator('.message').inner_text()))
   a=send('Explain Samsung in June 2026',False);a.locator('.cancel-report').click()
   check('Cancel displays no calculation',lambda:require('Cancelled' in a.locator('.message').inner_text()))
   page.locator('#newchat').click();a=send('How about Toyota?')
   check('New chat clears follow-up state',lambda:require(a.locator('.confirm-report').count()==0 and 'successfully executed' in a.locator('.message').inner_text()))
   a=send('What drove Samsung RWA higher in July?',False)
   if mode=='dom':
    debug=json.loads(a.locator('.debug').text_content())
    check('Opt-in debug exposes original text, matches and top-K scores',lambda:require(debug['explain']['input'].startswith('What drove') and len(debug['explain']['candidates'])>=3))
   else:check('Normal HTTP UI hides parser debug by default',lambda:require(a.locator('.debug').count()==0))
   page.locator('#newchat').click()
   a=send('comapre Samsung and Toyota in June',False)
   check('Typo compare reaches actual preview',lambda:require(a.locator('.confirm-report').count()==1 and 'TOYOTA' in a.inner_text()))
   a.locator('.confirm-report').click()
   check('Typo comparison executes both groups',lambda:require('SAMSUNG' in a.locator('.message').inner_text() and 'TOYOTA' in a.locator('.message').inner_text()))
   a=send('Explain Samsng in July',False)
   check('Entity typo resolves before data provider lookup',lambda:require(a.locator('.confirm-report').count()==1 and 'SAMSUNG' in a.inner_text()))
   if mode=='dom':
    debug=json.loads(a.locator('.debug').text_content())
    check('Accepted fuzzy evidence remains available only in debug',lambda:require(any(x['input']=='samsng' and x['accepted'] for x in debug['explain']['fuzzy']['attempts'])))
   a.locator('.confirm-report').click()
   a=send('Show top ten groups with RWA above 25 million in June',False)
   check('Word Top N and canonical amount reach the live preview path',lambda:require('10' in a.inner_text() and 'BALANCE GT 25 USDm' in a.inner_text()))
   a.locator('.cancel-report').click()
   a=send('Explain Samsung in Jully')
   check('Misspelled date is rejected, never auto-corrected',lambda:require(a.locator('.confirm-report').count()==0))
   a=send('Show groups above 25 miloin')
   check('Misspelled unit is rejected, never auto-corrected',lambda:require(a.locator('.confirm-report').count()==0))
   page.screenshot(path=str(ROOT/'reports/browser_desktop.png'),full_page=True)
   check('No unexpected requests in synthetic fixture',lambda:require(all(u.startswith('http://127.0.0.1:8765/') for u in requests)))
   check('No model/runtime assets requested',lambda:require(not any(any(x in u.lower() for x in ['.onnx','.wasm','transformers','huggingface']) for u in requests)))
   standalone=browser.new_page();standalone.on('pageerror',lambda e:errors.append(str(e)));standalone.set_content((ROOT/'standalone_demo.html').read_text());standalone.wait_for_function("document.querySelector('#status').textContent.startsWith('Ready')",timeout=20000)
   check('Normal standalone hides all parser debug by default',lambda:require(standalone.locator('.debug').count()==0))
   check('Second in-memory standalone document initializes with CSP hashes',lambda:require('Ready' in standalone.locator('#status').inner_text()))
   check('No browser JavaScript errors',lambda:require(not errors,str(errors)))
   browser.close()
 except Exception as e:
  results.append({'test':'Browser setup/navigation','passed':False,'error':str(e)})
 finally:
  if server:server.terminate();server.wait(timeout=5)
 report={'suite':'Chromium '+mode+' smoke test', 'mode':mode,'limitations':'DOM mode uses bundled identical app modules and synthetic assets in an in-memory document. HTTP/module loading, file navigation, server CSP, Tableau, SSO and SharePoint are not certified. No browser policy bypass.','passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results),'requests':requests,'pageErrors':errors,'tests':results}
 (ROOT/('reports/browser_'+mode+'_tests.json')).write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['requests','tests']},indent=2))
 for r in results:
  if not r['passed']:print(r)
 return int(report['failed']>0)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--mode',choices=['dom','http'],default='dom');raise SystemExit(run(p.parse_args().mode))
