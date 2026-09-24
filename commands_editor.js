import {validateCommands} from './rule_parser.js';
import {localText} from './network.js';
const $=id=>document.getElementById(id);let config;
function status(s){$('editor-status').textContent=s;}
function show(){
 $('json').value=JSON.stringify(config,null,2);$('template-list').replaceChildren();
 for(const p of config.patterns){const row=document.createElement('p'),check=document.createElement('input'),label=document.createElement('label');check.type='checkbox';check.checked=p.enabled;check.onchange=()=>{p.enabled=check.checked;$('json').value=JSON.stringify(config,null,2);};label.append(check,document.createTextNode(' '+p.id+' | '+p.questionPattern+' → '+p.canonicalPattern));row.append(label);$('template-list').append(row);}
}
function set(text){config=validateCommands(JSON.parse(text));show();status(`${config.patterns.length} templates loaded. Draft changes are local only.`);}
try{set(await localText('./command_patterns.txt'));}catch(e){status(e.message);}
$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>1000000)throw new Error('Registry limit: 1MB');set(await f.text());}catch(e){status(e.message);}};
$('add').onclick=()=>{try{if(!config)throw new Error('Load a registry first.');const next=JSON.parse(JSON.stringify(config));let n=1;while(next.patterns.some(p=>p.id==='CUSTOM_'+n))n++;next.patterns.push({id:'CUSTOM_'+n,enabled:true,questionPattern:$('pattern').value.trim(),canonicalPattern:$('canonical').value.trim()});config=validateCommands(next);show();status('Draft template added. Validate its meaning with tests before deployment.');}catch(e){status(e.message);}};
$('apply').onclick=()=>{try{set($('json').value);}catch(e){status(e.message);}};
$('save').onclick=()=>{try{config=validateCommands(JSON.parse($('json').value));const b=new Blob([JSON.stringify(config,null,2)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='command_patterns.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Draft downloaded. This did not modify the deployed app.');}catch(e){status(e.message);}};
