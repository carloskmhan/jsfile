import sys,json,time,threading,http.server,socketserver,functools
from pathlib import Path
from playwright.sync_api import sync_playwright
b=Path(__file__).resolve().parents[1];sys.path.insert(0,str(b/'tools'))
import build_standalone
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
httpd=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(b)))
threading.Thread(target=httpd.serve_forever,daemon=True).start();port=httpd.server_address[1]
report={'scope':'Synthetic real application UI tests. No bank Tableau/SSO.', 'http':{},'checks':[],'browserErrors':[]}
def check(n,f):
 try:f();report['checks'].append({'name':n,'pass':True})
 except Exception as e:report['checks'].append({'name':n,'pass':False,'error':str(e)})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':950});page.on('pageerror',lambda e:report['browserErrors'].append(str(e)))
 try:
  page.goto(f'http://127.0.0.1:{port}/demo.html',timeout=20000)
  page.wait_for_function("() => document.getElementById('status').textContent.startsWith('Ready')",timeout=12000)
  report['http']={'pass':True,'note':'Local HTTP ES module/fetch path loaded successfully; no live Tableau.'}
 except Exception as e:
  report['http']={'pass':False,'error':str(e),'note':'No policy bypass. Testing identical synthetic standalone modules with in-memory DOM separately.'}
  page=browser.new_page(viewport={'width':1280,'height':950});page.on('pageerror',lambda e:report['browserErrors'].append(str(e)))
  page.set_content(build_standalone.make_html(b,test_mode=True),wait_until='domcontentloaded',timeout=30000)
  page.wait_for_function("() => document.getElementById('status').textContent.startsWith('Ready')",timeout=15000)
 # check 5 second splash still there and dots
 def assert_(x,msg='assertion failed'):
  assert x,msg
 check('Three wave dots',lambda:assert_(page.locator('.rwa-loading-dot').count()==3))
 check('5-second splash configuration preserved',lambda:assert_(page.locator('#rwa-loading-screen').get_attribute('data-minimum-ms')=='5000'))
 page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'",timeout=10000)
 outdir=b/'reports'/'ui';outdir.mkdir(exist_ok=True)
 check('No horizontal overflow desktop',lambda:assert_(page.evaluate('document.documentElement.scrollWidth <= innerWidth')))
 check('Rule artifact has no aliases in compiled runtime',lambda:assert_(page.evaluate("!window.RWA_TEST_CONFIG || RWA_TEST_CONFIG.commandPatterns.aliases.length===0")))
 def submit(q,run=True):
  page.fill('#question',q);page.click('#ask')
  page.wait_for_function("() => !document.getElementById('ask').disabled",timeout=15000)
  a=page.locator('#history article.assistant').last
  if run:
   assert a.locator('.confirm-report').count()==1,a.inner_text()
   a.locator('.confirm-report').click()
   page.wait_for_function("() => !document.getElementById('ask').disabled",timeout=15000)
  return a.inner_text()
 def q1():
  t=submit('Why did Samsung RWA increase in July?');assert 'SAMSUNG GROUP' in t,t;assert '2026-07' in t,t;assert 'decreased' in t,t
 check('Samsung July data from sample-generated runtime index',q1)
 check('Toyota group follow-up preserves July',lambda:assert_('2026-07' in submit('How about Toyota?')))
 check('August resolves but unavailable data does not fall back',lambda:assert_('No data for 2026-08' in submit('And August?')))
 check('Can return to explicit June Samsung after missing data',lambda:assert_('1.24bn' in submit('Explain Samsung in June 2026')))
 def cancel():
  t=submit('Compare Samsung and Toyota in June',False);assert 'CG0001' in t and 'CG0004' in t,t
  page.locator('#history article.assistant').last.locator('.cancel-report').click();assert 'Cancelled' in page.locator('#history article.assistant').last.inner_text()
 check('Comparison preview shows IDs and cancel works',cancel)
 check('Ranking displays client names and handles existing state',lambda:assert_('Samsung' in submit('Top 3 entities in June')))
 page.locator('#settings').evaluate('(e)=>e.open=true');page.fill('#group-search','Toyota');
 check('Group search filters displayed options by name',lambda:assert_('TOYOTA' in page.locator('#group').inner_text()))
 page.fill('#group-search','CG0001');check('Group search by ID',lambda:assert_('SAMSUNG' in page.locator('#group').inner_text()))
 page.fill('#group-search','');page.screenshot(path=str(outdir/'01_chat_and_index.png'),full_page=False)
 page.click('#newchat');check('New chat clears history without re-showing splash',lambda:assert_(page.locator('#history article').count()==0 and page.evaluate("document.documentElement.dataset.rwaLoadingState==='done'")))
 check('Unsupported request cannot produce confirmation',lambda:assert_('Unsupported' in submit('Predict Samsung RWA next year',False)))
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(outdir/'02_mobile.png'),full_page=False)
 check('No horizontal overflow mobile',lambda:assert_(page.evaluate('document.documentElement.scrollWidth<=innerWidth')))
 browser.close()
httpd.shutdown()
report.update(passed=sum(x['pass'] for x in report['checks']),failed=sum(not x['pass'] for x in report['checks']))
(b/'reports/browser_connected.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
