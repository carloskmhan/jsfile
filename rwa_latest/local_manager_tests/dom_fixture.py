"""Isolated DOM fixture: real JS modules, PRECOMPUTED compiler fixtures, mocked HTTP API.
No navigation, forwarding blocked network, or browser policy modifications.
"""
from pathlib import Path
import re,json,hashlib,base64,posixpath,copy,tempfile,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from rule_manager import Workbench
from local_manager_tests.test_manager import fixture
IMPORT=re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
REEXPORT=re.compile(r"export\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
def resolve(name,target):
 if target.startswith('/engine/'):return target[8:]
 return posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
def make_html():
 with tempfile.TemporaryDirectory() as t:
  root=Path(t);fixture(root);w=Workbench(root);b=w.bootstrap();b['projectName']=ROOT.name;assets=w.test_assets
  pl={'revision':b['revision'],'tables':copy.deepcopy(b['tables'])}
  pl['tables']['synonyms.csv']['rows'].append({'concept':'ROOT','phrase':'take me through','weight':'1','enabled':'true','notes':'Browser smoke-test expression'})
  d=w.validate(pl);saved=w.commit({'draftId':d['draftId'],'revision':pl['revision']})
  stored=w.list_backups()[0];w.close()
 data={'bootstrap':b,'assets':assets,'draft':d,'saved':saved,'backup':stored}
 js="'use strict';const M=Object.create(null);const F="+json.dumps(data,ensure_ascii=False).replace('<','\\u003c')+';\n'
 js+=r'''
const clone=x=>JSON.parse(JSON.stringify(x));
let disk=clone(F.bootstrap), backups=[],commits=0;
globalThis.__RM_MOCK={get state(){return {disk,backups,commits};},calls:[]};
globalThis.fetch=async (url,options={})=>{
 const path=String(url);const p=options.body?JSON.parse(options.body):{};
 __RM_MOCK.calls.push({path,method:options.method||'GET'});
 let out,status=200;
 if(path==='/api/bootstrap')out={...F.bootstrap,...disk};
 else if(path==='/api/test-assets')out=F.assets;
 else if(path==='/api/snapshot')out=disk;
 else if(path==='/api/backups')out={backups};
 else if(path==='/api/validate'){
  const added=p.tables['synonyms.csv'].rows.filter(r=>r.phrase==='take me through');
  if(p.tables['synonyms.csv'].rows.some(r=>r.phrase==='increase'&&r.concept==='DECREASE')){
   status=422;out={ok:false,code:'COMPILER_VALIDATION',message:'synonyms.csv line 564: duplicate/conflicting phrase increase. Existing artifact was not replaced.',file:'synonyms.csv',line:564};
  }else if(added.length===1)out=F.draft;
  else out={...F.draft,generatedText:F.bootstrap.generatedText,artifactHash:F.bootstrap.artifactHash,changes:[]};
 }else if(path==='/api/commit'){commits++;disk=clone(F.saved);backups=[F.backup];out=disk;}
 else if(path==='/api/restore'){disk=clone(F.bootstrap);backups=[{...F.backup,id:'20260925T020000Z-123456abcdef',note:'Restore'},...backups];out=disk;}
 else if(path==='/api/download')return new Response(disk.generatedText,{status:200});
 else {status=404;out={message:'Mock endpoint not available: '+path};}
 return new Response(JSON.stringify(out),{status,headers:{'Content-Type':'application/json'}});
};
'''
 seen=set();order=[]
 def visit(name):
  if name in seen:return
  seen.add(name);src=(ROOT/name).read_text()
  for regex in (IMPORT,REEXPORT):
   for m in regex.finditer(src):visit(resolve(name,m[2]))
  order.append(name)
 visit('local_manager/manager.js')
 for name in order:
  src=(ROOT/name).read_text();exports=re.findall(r'export\s+(?:async\s+)?(?:class|function|const)\s+(\w+)',src)
  def rex(m):
   ps=[]
   for part in m[1].split(','):
    bits=part.strip().split(' as ');exports.append(bits[-1]);ps.append(bits[0]+(':'+bits[-1] if len(bits)>1 else ''))
   return 'const {'+','.join(ps)+'}=M['+json.dumps(resolve(name,m[2]))+'];'
  src=REEXPORT.sub(rex,src);src=IMPORT.sub(lambda m:'const {'+re.sub(r'\s+as\s+',':',m[1])+'}=M['+json.dumps(resolve(name,m[2]))+'];',src)
  src=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:class|function|const)\b)','',src)
  js+='M['+json.dumps(name)+']=(()=>{\n'+src+'\nreturn {'+','.join(dict.fromkeys(exports))+'};\n})();\n'
 css=(ROOT/'local_manager/manager.css').read_text()
 sha=lambda x:base64.b64encode(hashlib.sha256(x.encode()).digest()).decode()
 html=(ROOT/'local_manager/advanced.html').read_text().replace('<link rel="stylesheet" href="/manager.css">','<style>'+css+'</style>')
 html=html.replace('<script type="module" src="/manager.js"></script>','<script>'+js+'</script>')
 csp=f"default-src 'none'; script-src 'sha256-{sha(js)}'; style-src 'sha256-{sha(css)}'; connect-src 'none'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"
 html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">')
 return html
