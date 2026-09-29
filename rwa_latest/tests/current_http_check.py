from pathlib import Path
import subprocess,sys,time,http.client,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports'/'chat_ux';OUT.mkdir(parents=True,exist_ok=True)
proc=subprocess.Popen([sys.executable,'rule_manager.py','--no-open','--port','8779'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
checks=[];browser={}
try:
 for attempt in range(60):
  try:
   c=http.client.HTTPConnection('127.0.0.1',8779,timeout=2);c.request('GET','/api/bootstrap');r=c.getresponse();data=json.loads(r.read());c.close()
   if r.status==200:break
  except (OSError,ValueError):time.sleep(.1)
 else:raise RuntimeError('Manager did not start')
 checks.append({'name':'Actual localhost manager/bootstrap','passed':r.status==200})
 for path,kind in [('/api/capabilities','json'),('/engine/historical_peaks.js','js'),('/simple.js','js')]:
  c=http.client.HTTPConnection('127.0.0.1',8779,timeout=5);c.request('GET',path,headers={'X-RWA-CSRF':data['csrfToken']});r=c.getresponse();body=r.read().decode();c.close()
  checks.append({'name':path,'passed':r.status==200 and (bool(body) if kind=='js' else any(x['kind']=='historical_peak_groups' for x in json.loads(body)['cards']))})
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=b.new_page()
  try:
   page.goto('http://127.0.0.1:8779/',wait_until='networkidle',timeout=15000);page.wait_for_selector('.capability',timeout=15000)
   browser={'status':'success','cards':page.locator('.capability').count()};page.screenshot(path=str(OUT/'09_actual_localhost.png'))
  except Exception as e:browser={'status':'not_verified','reason':str(e)}
  b.close()
finally:
 proc.terminate()
 try:proc.wait(timeout=5)
 except subprocess.TimeoutExpired:proc.kill()
 (OUT/'localhost_check.json').write_text(json.dumps({'http_checks':checks,'browser':browser},indent=2))
 print(json.dumps({'http_checks':checks,'browser':browser}))
