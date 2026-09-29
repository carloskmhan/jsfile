from pathlib import Path
import sys,base64,hashlib,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports'/'chat_ux';OUT.mkdir(parents=True,exist_ok=True);sys.path.insert(0,str(ROOT/'tools'));import build_standalone
js=build_standalone.bundle(ROOT,True)
insert="""
const records=M['csv_adapter.js'].parseCsv(DATA[config.sampleCsvUrl]);
const payload=JSON.parse(records[0].json_data),row=payload.rows.find(r=>r.month==='2026-07');
row.rwa_prev=-5;row.rwa_curr=10;row.drivers={EAD:15};row.attributes={rwa_prev_source:'derived_from_current_rwa_minus_deduplicated_driver_impacts'};
records[0].json_data=JSON.stringify(payload);
const headers=Object.keys(records[0]);const cell=x=>'"'+String(x).replaceAll('"','""')+'"';
DATA[config.sampleCsvUrl]=[headers.map(cell).join(','),...records.map(r=>headers.map(k=>cell(r[k])).join(','))].join('\\n');config.animateAnswers=false;
"""
new=js.replace('globalThis.RWA_APP_READY=',insert+'\nglobalThis.RWA_APP_READY=')
hash64=lambda s:base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
html=build_standalone.make_html(ROOT,True).replace(js,new).replace('sha256-'+hash64(js),'sha256-'+hash64(new))
checks=[]
def check(n,ok):checks.append({'name':n,'passed':bool(ok)});assert ok,n
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=b.new_page(viewport={'width':1440,'height':1000});page.set_content(html);page.wait_for_function("()=>document.documentElement.dataset.rwaLoadingState==='done'")
 page.fill('#question','Top 10 groups in July');page.click('#ask');page.wait_for_selector('.confirm-report:not([disabled])');page.click('.confirm-report');page.wait_for_function("()=>!document.querySelector('#ask').disabled")
 a=page.locator('#history article.assistant').last
 check('Negative basis paragraph is absent from ordinary message','A negative derived' not in a.locator('.message').inner_text())
 d=a.locator('.rwa-calculation-notes');check('Calculation notes exist and start collapsed',d.count()==1 and d.get_attribute('open') is None)
 check('Exact original diagnostic remains in details','A negative derived' in d.text_content())
 d.locator('summary').click();check('Diagnostic is available when expanded','A negative derived' in d.inner_text())
 d.locator('summary').click();page.screenshot(path=str(OUT/'10_notes_collapsed.png'))
 check('Disabled animation setting shows full answer immediately',page.locator('.rwa-typing-text').count()==0)
 b.close()
(OUT/'notes_browser.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'failed':0,'scope':'Synthetic modified fixture, real app UI; not bank data.'},indent=2));print(len(checks),'checks passed')
