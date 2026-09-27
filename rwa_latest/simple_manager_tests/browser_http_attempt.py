"""Try real loopback browser navigation without changing browser policy.
A blocked navigation is recorded as NOT TESTED, never as a successful UI test.
"""
from pathlib import Path
import sys,tempfile,shutil,subprocess,time,socket,json,http.client
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from local_manager_tests.test_manager import fixture
from playwright.sync_api import sync_playwright
result={'scope':'Actual rule_manager.py and browser localhost navigation','policyBypassed':False,'status':'NOT_RUN'}
with tempfile.TemporaryDirectory(prefix='rwa-browser-http-') as td:
 root=Path(td)/'project';root.mkdir();fixture(root)
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 with open(Path(td)/'log.txt','w') as f:proc=subprocess.Popen([sys.executable,str(ROOT/'rule_manager.py'),'--project',str(root),'--port',str(port),'--no-open'],stdout=f,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   try:
    c=http.client.HTTPConnection('127.0.0.1',port,timeout=2);c.request('GET','/api/bootstrap');r=c.getresponse();r.read();c.close()
    if r.status==200:break
   except OSError:time.sleep(.1)
  result['serverHttpResponded']=r.status==200
  with sync_playwright() as pw:
   browser=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'));page=browser.new_page()
   try:
    page.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded',timeout=20000);page.wait_for_selector('.capability',timeout=10000)
    result.update(status='HOME_NAVIGATION_PASSED',cardCount=page.locator('.capability').count())
   except Exception as e:
    result.update(status='BLOCKED_BY_ENVIRONMENT' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(e) else 'FAILED',reason=str(e).split('Call log:')[0].strip(),fullBrowserHttpWorkflowValidated=False)
   finally:browser.close()
 finally:
  proc.terminate();proc.wait(timeout=10)
(ROOT/'simple_manager_reports/browser_http_attempt.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
