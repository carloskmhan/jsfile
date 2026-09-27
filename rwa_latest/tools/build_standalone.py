"""Bundle the SAME application modules with synthetic data. Packaging, not training.
No HTTP, external script, vendor runtime or model is used by the generated demo.
"""
from pathlib import Path
import re,json,hashlib,base64,argparse,posixpath
ROOT=Path(__file__).resolve().parents[1]
IMPORT=re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
REEXPORT=re.compile(r"export\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
def resolve(name,other):return posixpath.normpath(posixpath.join(posixpath.dirname(name),other))
def parse_rule(s):return json.loads(re.sub(r'^(?:#[^\n]*\n)+','',s.lstrip('\ufeff')))
def modules(root):
 seen=set();order=[]
 def visit(name):
  if name in seen:return
  seen.add(name);source=(root/name).read_text()
  for regex in (IMPORT,REEXPORT):
   for match in regex.finditer(source):
    target=resolve(name,match[2])
    if not target.endswith('.js') or target.startswith('../'):raise ValueError('Unexpected dependency '+target)
    visit(target)
  order.append(name)
 visit('app.js');return order

def bundle(root=ROOT,test_mode=False):
 cfg=json.loads((root/'tableau_config.txt').read_text());cfg.update(mode='sample',rules=json.loads((root/'rules_config.txt').read_text()),commandPatterns=parse_rule((root/'command_patterns.txt').read_text()))
 if test_mode:cfg['debug']=True
 data={cfg['sampleCsvUrl']:(root/'tableau_sample.csv').read_text()}
 js="'use strict';\nconst M=Object.create(null);\nconst DATA="+json.dumps(data,ensure_ascii=False).replace('<','\\u003c')+';\n'
 for name in modules(root):
  src=(root/name).read_text()
  if name=='network.js':src="export async function localText(path){if(!Object.hasOwn(DATA,path))throw new Error('Synthetic demo: unknown fixture');return DATA[path];}"
  exports=re.findall(r'export\s+(?:async\s+)?(?:class|function|const)\s+(\w+)',src)
  def reexport(m):
   pairs=[]
   for word in m[1].split(','):
    parts=word.strip().split(' as ');exports.append(parts[-1]);pairs.append(parts[0]+(':'+parts[-1] if len(parts)>1 else ''))
   return 'const {'+','.join(pairs)+'}=M['+json.dumps(resolve(name,m[2]))+'];'
  src=REEXPORT.sub(reexport,src)
  src=IMPORT.sub(lambda m:'const {'+re.sub(r'\s+as\s+',':',m[1])+'}=M['+json.dumps(resolve(name,m[2]))+'];',src)
  src=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:class|function|const)\b)','',src)
  js+='M['+json.dumps(name)+']=(()=>{\n'+src+'\nreturn {'+','.join(dict.fromkeys(exports))+'};\n})();\n'
 js+='const config='+json.dumps(cfg,ensure_ascii=False).replace('<','\\u003c')+';\n'
 if test_mode:js+='globalThis.RWA_TEST_MODULES=M;globalThis.RWA_TEST_CONFIG=config;\n'
 js+="globalThis.RWA_APP_READY=M['app.js'].main(config).finally(()=>{document.documentElement.dataset.rwaInitialization='settled';document.dispatchEvent(new Event('rwa:initialization-settled'));});\n"
 return js

def make_html(root=ROOT,test_mode=False):
 js=bundle(root,test_mode)
 loading=(root/'loading_screen.js').read_text()
 styles=[(root/n).read_text() for n in ('styles.css','catalog_ui.css','loading_screen.css')]
 hash64=lambda s:base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()
 html=(root/'demo.html').read_text()
 for n,css in zip(('styles.css','catalog_ui.css','loading_screen.css'),styles):
  html=html.replace('<link rel="stylesheet" href="'+n+'">','<style>'+css+'</style>')
 html=html.replace('<script src="loading_screen.js"></script>','<script>'+loading+'</script>')
 html=html.replace('<script type="module" src="bootstrap.js"></script>','<script>'+js+'</script>')
 html=html.replace('DETERMINISTIC RWA REPORTS · NO MACHINE LEARNING','SYNTHETIC DEMO · DETERMINISTIC RULES').replace('<a href="commands_editor.html" target="_blank" rel="noopener">CSV rule maintenance</a>','Edit the CSV sources in the full package and rebuild this demo to change its rules.')
 script_hashes=' '.join("'sha256-"+hash64(x)+"'" for x in (js,loading))
 style_hashes=' '.join("'sha256-"+hash64(x)+"'" for x in styles)
 csp=f"default-src 'none'; script-src {script_hashes}; style-src {style_hashes}; connect-src 'none'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"
 return html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">',1)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--web',type=Path,default=ROOT);p.add_argument('--test-mode',action='store_true');a=p.parse_args();target=a.web/'standalone_demo.html';target.write_text(make_html(a.web,a.test_mode));print(target,target.stat().st_size)
