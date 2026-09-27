import sys,re,json,hashlib,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'tools'));import build_standalone
js=build_standalone.bundle(root,True)
mock=r'''
Object.assign(config,{mode:'tableau',catalogSource:'tableau',tableauUrl:'https://tableau.example.invalid/views/Test/IndexDashboard',allowPortfolioQueries:true});
const records=M['csv_adapter.js'].parseCsv(DATA[config.sampleCsvUrl]);
const copy=JSON.parse(JSON.stringify(records[0]));copy.client_group_id='CG9999';records.push(copy);
let selected=[],idx=records.map(r=>({client_group_id:r.client_group_id,client_group_name:r.client_group_name}));const events=new Map(),calls=[];
const table=(rows,names)=>({getColumns:()=>names.map((n,i)=>({getFieldName:()=>n,getIndex:()=>i})),getData:()=>rows.map(r=>names.map(n=>({value:r[n]}))),getTotalRowCount:()=>rows.length,getIsTotalRowCountLimited:()=>false});
const filter=()=>({getFieldName:()=>config.filterField,getAppliedValues:()=>selected.map(value=>({value})),getIsExcludeMode:()=>false});
const isheet={getName:()=>config.catalogWorksheetName,getSummaryDataAsync:async()=>{calls.push('index');return table(idx,Object.values(config.catalogFields));}};
const dsheet={getName:()=>config.worksheetName,applyFilterAsync:async(f,v,m)=>{selected=[...v];calls.push('filter:'+v.join(','));emit('filterchange',{getWorksheet:()=>dsheet,getFieldName:()=>f,getFilterAsync:async()=>filter()});},getFiltersAsync:async()=>[filter()],getSummaryDataAsync:async()=>{calls.push('data:'+selected.join(','));return table(records.filter(r=>selected.includes(r.client_group_id)),Object.values(config.fields));}};
function emit(name,extra={}){for(const cb of events.get(name)||[])cb({getEventName:()=>name,...extra});}
globalThis.__TABLEAU_MOCK={calls,emit,removeGroup(id){idx=idx.filter(r=>r.client_group_id!==id);emit('parametervaluechange');}};
globalThis.tableau={Viz:class{constructor(h,url,o){setTimeout(()=>o.onFirstInteractive(),0);}getWorkbook(){return{getActiveSheet:()=>({getSheetType:()=>'dashboard',getWorksheets:()=>[isheet,dsheet]})};}addEventListener(n,f){if(!events.has(n))events.set(n,[]);events.get(n).push(f);}removeEventListener(){}dispose(){}}};
'''
newjs=js.replace('globalThis.RWA_APP_READY=',mock+'\nglobalThis.RWA_APP_READY=')
html=build_standalone.make_html(root,True).replace(js,newjs)
h=lambda s:base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
html=html.replace('sha256-'+h(js),'sha256-'+h(newjs))
checks=[];errors=[]
def mark(n,ok,detail=''):
 checks.append({'name':n,'pass':bool(ok),'detail':detail})
 assert ok,n+': '+detail
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True);page=b.new_page(viewport={'width':1280,'height':900});page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.set_content(html);page.wait_for_function("() => document.getElementById('status').textContent.startsWith('Ready')")
  mark('Live app path initialises names only from separate mocked index',page.evaluate("__TABLEAU_MOCK.calls.length===1&&__TABLEAU_MOCK.calls[0]==='index'"))
  page.wait_for_function("() => document.documentElement.dataset.rwaLoadingState==='done'")
  def send(q,run=True):
   page.fill('#question',q);page.click('#ask');page.wait_for_function("() => !document.getElementById('ask').disabled")
   a=page.locator('#history article.assistant').last
   if run:
    assert a.locator('.confirm-report').count(),a.inner_text()
    a.locator('.confirm-report').click();page.wait_for_function("() => !document.getElementById('ask').disabled")
   return a.inner_text()
  t=send('Why did Samsung increase in July?',False)
  mark('Same-name distinct group IDs prompt clarification', 'multiple IDs' in t and 'CG0001' in t and 'CG9999' in t,t)
  mark('Ambiguous request does not load financial data',page.evaluate("!__TABLEAU_MOCK.calls.some(x=>x.startsWith('data:'))"))
  t=send('Why did CG0001 RWA increase in July?');mark('Unique group ID executes separate detail worksheet','decreased' in t and '2026-07' in t,t)
  mark('Only selected ID was applied to detail',page.evaluate("__TABLEAU_MOCK.calls.includes('filter:CG0001')"))
  t=send('How about Toyota?');mark('Follow-up uses fresh Toyota query, July inherited','TOYOTA GROUP' in t and '2026-07' in t,t)
  mark('Toyota detail fetched rather than Samsung result copied',page.evaluate("__TABLEAU_MOCK.calls.includes('data:CG0004')"))
  t=send('Compare CG0001 and CG9999 in June');mark('Same-name groups compare separately by IDs','CG0001' in t and 'CG9999' in t,t)
  page.evaluate("__TABLEAU_MOCK.removeGroup('CG0001')")
  mark('External scope change invalidates context','discarded' in page.locator('#status').inner_text())
  t=send('Explain CG0001 in July',False);mark('Removed ID cannot execute',page.locator('#history article.assistant').last.locator('.confirm-report').count()==0,t)
  mark('No JavaScript exceptions',not errors,str(errors))
  (root/'reports/ui').mkdir(exist_ok=True);page.screenshot(path=str(root/'reports/ui/03_mocked_tableau_path.png'))
 finally:
  report={'scope':'Full app.js/provider/parser/calculator path in Chromium DOM with mock Tableau v2 sheets. No actual SDK, HTTP/SSO/permissions validation.', 'passed':sum(x['pass'] for x in checks),'failed':sum(not x['pass'] for x in checks),'checks':checks,'errors':errors}
  (root/'reports/browser_tableau_mock.json').write_text(json.dumps(report,indent=2));b.close();print(json.dumps(report,indent=2))
