"""Actual rule_manager.py subprocess and loopback HTTP workflow.
This exercises server/compiler/filesystem, not browser rendering or bank SSO.
"""
from pathlib import Path
import sys, tempfile, socket, subprocess, http.client, json, time, hashlib, shutil
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from local_manager_tests.test_manager import fixture
report=ROOT/'simple_manager_reports/http_workflow.json'
checks=[]
def mark(name, passed=True):
 checks.append({'name':name,'passed':bool(passed)})
 if not passed:raise AssertionError(name)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='rwa-simple-http-') as td:
 root=Path(td)/'project';root.mkdir();fixture(root)
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 log=Path(td)/'server.log'
 with log.open('w') as stream:
  process=subprocess.Popen([sys.executable,str(ROOT/'rule_manager.py'),'--project',str(root),'--port',str(port),'--no-open'],stdout=stream,stderr=subprocess.STDOUT)
 token='';origin=f'http://127.0.0.1:{port}'
 def req(path,body=None,override=None):
  headers={'X-RWA-CSRF':token}
  if body is not None:headers.update({'Content-Type':'application/json','Origin':origin})
  headers.update(override or {})
  c=http.client.HTTPConnection('127.0.0.1',port,timeout=40)
  c.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,headers)
  r=c.getresponse();raw=r.read();h=dict(r.getheaders());status=r.status;c.close()
  try:data=json.loads(raw)
  except ValueError:data=raw
  return status,h,data
 def snap():return req('/api/snapshot')[2]
 def prepare(**kw):
  payload={'revision':snap()['revision'],'operation':'save','kind':'movement','title':'HTTP reviewed movement','measure':'question','numberMode':'question','exampleNumber':10,'periodMode':'question','examples':[{'question':'Take me through Samsung RWA movement in July','phrase':'take me through'}]};payload.update(kw);return req('/api/capabilities/prepare',payload)
 def commit(d):return req('/api/capabilities/commit',{'revision':d['revision'],'draftId':d['draftId'],'checkToken':d['checkToken'],'artifactHash':d['artifactHash'],'checksPassed':True})
 try:
  for _ in range(100):
   try:status,headers,boot=req('/api/bootstrap');break
   except OSError:time.sleep(.1)
  else:raise RuntimeError(log.read_text())
  mark('rule_manager.py starts and responds on localhost',status==200 and process.poll() is None)
  token=boot['csrfToken'];before=snap();oldhash=digest(root/'command_patterns.txt')
  status,headers,html=req('/');mark('Home is served as English HTML',status==200 and b'Add new capability' in html and b'lang="en"' in html)
  mark('No-cache and same-origin policies retained',headers['Cache-Control']=='no-store' and 'Access-Control-Allow-Origin' not in headers and "connect-src 'self'" in headers['Content-Security-Policy'])
  for path in ['/simple.js','/simple_logic.js','/simple.css','/advanced','/manager.js','/test_lab.js','/engine/semantic/engine.js']:
   status,h,data=req(path);mark('Serves '+path,status==200 and len(data)>0)
  status,h,c=req('/api/capabilities');mark('Existing cards exposed through HTTP',status==200 and len(c['cards'])==19)
  status,h,d=prepare();mark('Real compiler validates a capability draft over HTTP',status==200 and d['ok'])
  mark('Prepare leaves published rules intact',oldhash==digest(root/'command_patterns.txt') and not (root/'rules/capabilities.csv').exists())
  mark('Missing confirmation token cannot commit',req('/api/capabilities/commit',{'draftId':d['draftId'],'revision':d['revision']})[0]==422)
  status,h,saved=commit(d);mark('Save atomically publishes CSV and compiled artifact',status==200 and snap()['artifactConsistent'] and (root/'rules/capabilities.csv').exists())
  mark('New compiled expression is downloadable','take me through' in req('/api/download')[2].decode())
  a=d['id'];status,h,d=prepare(id=a,title='Renamed through HTTP');mark('Edit can rename a capability',status==200);mark('Edited capability commits',commit(d)[0]==200)
  status,h,d=prepare(title='Shared HTTP expression');b=d['id'];mark('A second capability reuses the same expression',status==200 and commit(d)[0]==200)
  status,h,d=req('/api/capabilities/prepare',{'revision':snap()['revision'],'operation':'delete','id':a});mark('Delete prepared with dependency analysis',status==200);mark('Delete preserves shared expression',commit(d)[0]==200 and 'take me through' in (root/'command_patterns.txt').read_text())
  status,h,d=req('/api/capabilities/prepare',{'revision':snap()['revision'],'operation':'delete','id':b});mark('Last owner cleanup succeeds',status==200 and commit(d)[0]==200 and 'take me through' not in (root/'command_patterns.txt').read_text())
  safe=snap()['revision'];status,h,_=prepare(kind='follow_scope',examples=[{'question':'Carry on for Toyota','pattern':'carry [on] for {scope}'}]);mark('Existing compiler rejects unsafe syntax',status==422);mark('Compiler failure preserves source and generated revisions',safe==snap()['revision'])
  mark('Cross-origin write rejected',prepare()[0]==200 and req('/api/capabilities/prepare',{}, {'Origin':'https://attacker.invalid'})[0]==403)
  mark('Missing CSRF token rejected',req('/api/capabilities',override={'X-RWA-CSRF':''})[0]==403)
  mark('Private rule metadata is not a static public file',req('/rules/capability_examples.csv')[0]==404)
  mark('Customer aliases are not reintroduced',not (root/'rules/aliases.csv').exists())
  mark('Backups are retained',len(req('/api/backups')[2]['backups'])>=4)
 finally:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
  report.parent.mkdir(exist_ok=True)
  report.write_text(json.dumps({'scope':'Actual Python subprocess, real loopback HTTP, existing compiler and files. Client check evidence is supplied by this endpoint test; separate browser tests exercise real parsing. No live Tableau or browser-HTTP certification.','checks':checks,'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks)},indent=2))
print(json.dumps({'passed':len(checks),'failed':0}))
