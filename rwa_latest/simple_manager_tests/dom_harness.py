"""In-memory browser test, not a bypass of blocked localhost navigation.
Actual manager/engine JavaScript. A test-only function calls the real Workbench
methods on a disposable directory; no browser requests are sent or forwarded.
Loopback HTTP is separately tested using Python's HTTP client.
"""
from pathlib import Path
import sys,re,posixpath,json,base64,hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from rule_manager import Workbench,ManagerError
IMPORT=re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
REEXPORT=re.compile(r"export\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
def resolve(name,target):
    if target.startswith('/engine/'):return target[8:]
    return posixpath.normpath(posixpath.join(posixpath.dirname(name),target))
def module_bundle(root,entry):
    seen=set();order=[]
    def visit(name):
        if name in seen:return
        seen.add(name);src=(root/name).read_text()
        for rx in [IMPORT,REEXPORT]:
            for m in rx.finditer(src):visit(resolve(name,m[2]))
        order.append(name)
    visit(entry)
    js='const M=Object.create(null);\n'
    for name in order:
        src=(root/name).read_text();exports=re.findall(r'export\s+(?:async\s+)?(?:class|function|const)\s+(\w+)',src)
        def rex(m):
            pairs=[]
            for item in m[1].split(','):
                bits=item.strip().split(' as ');exports.append(bits[-1]);pairs.append(bits[0]+(':'+bits[-1] if len(bits)>1 else ''))
            return 'const {'+','.join(pairs)+'}=M['+json.dumps(resolve(name,m[2]))+'];'
        src=REEXPORT.sub(rex,src)
        src=IMPORT.sub(lambda m:'const {'+re.sub(r'\s+as\s+',':',m[1])+'}=M['+json.dumps(resolve(name,m[2]))+'];',src)
        src=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:class|function|const)\b)','',src)
        js+='M['+json.dumps(name)+']=(()=>{\n'+src+'\nreturn {'+','.join(dict.fromkeys(exports))+'};\n})();\n'
    return js

def make_html(root=ROOT):
    js=r'''"use strict";
window.__testApiCalls=[];
window.fetch=async (url,options={})=>{
 const path=String(url);const payload=options.body?JSON.parse(options.body):null;
 __testApiCalls.push({path,method:options.method||'GET'});
 const r=await window.__localTestCall({path,payload});
 return new Response(typeof r.body==='string'?r.body:JSON.stringify(r.body),{status:r.status,headers:{'Content-Type':'application/json'}});
};
'''+module_bundle(root,'local_manager/simple.js')+'\nglobalThis.__TEST_MODULES=M;'
    css=(root/'local_manager/simple.css').read_text()
    html=(root/'local_manager/index.html').read_text().replace('<link rel="stylesheet" href="/simple.css">','<style>'+css+'</style>').replace('<script type="module" src="/simple.js"></script>','<script>'+js+'</script>')
    sha=lambda s:base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
    csp=f"default-src 'none'; script-src 'sha256-{sha(js)}'; style-src 'sha256-{sha(css)}'; connect-src 'none'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"
    return html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">')

class DirectBackend:
    def __init__(self,root):self.w=Workbench(root);self.calls=[]
    def close(self):self.w.close()
    def call(self,args):
        path=args['path'];p=args.get('payload') or {};self.calls.append(path)
        try:
            if path=='/api/bootstrap':r=self.w.bootstrap()
            elif path=='/api/capabilities':r=self.w.capabilities.list()
            elif path=='/api/test-assets':r=self.w.test_assets
            elif path=='/api/capabilities/prepare':r=self.w.capabilities.prepare(p)
            elif path=='/api/capabilities/commit':r=self.w.capabilities.commit(p)
            elif path=='/api/download':r=self.w.read_snapshot()['generatedText']
            elif path=='/api/validate':r=self.w.validate(p)
            else:return {'status':404,'body':{'message':'Test endpoint not supplied'}}
            return {'status':200,'body':r}
        except ManagerError as e:return {'status':e.status,'body':{'ok':False,'message':str(e),'code':e.code,**e.details}}
        except Exception as e:
            import traceback;traceback.print_exc()
            return {'status':500,'body':{'message':type(e).__name__+': '+str(e)}}
