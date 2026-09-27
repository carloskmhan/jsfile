"""Real unmodified v1.0.8 builder -> CSV -> v6 adapter/parser/calculation. Synthetic only."""
import csv, json, tempfile, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='rwa-v108-integration-') as td:
 t=Path(td);raw=t/'raw.csv'
 cfg=json.loads((ROOT/'data_builder/data_mapping.example.json').read_text())
 headers=list(dict.fromkeys(v for v in cfg['columns'].values() if v))
 def record(gid,name,eid,curr,driver,impact,prev='1'):
  return {'client group id':gid,'client group name':name,'LEID':eid,'client name':'Shared Client','Reporting Month':'2026-07','RWA':str(curr*1000000),'CG':'7','EAD':'300000000','Scorecard':'CORPORATE','detail_driver':driver,'RWA Diff by driver':str(impact*1000000),'prev_rwa':prev,'prev_cg':prev,'prev_ead':prev,'prev_scorecard':prev,'prev_group':prev,'prev_group_code':prev}
 rows=[record('00001','ACME GROUP','001',100,'EAD Increase (STD)',10),record('00001','Acme Legacy','001',100,'EAD Increase (STD)',10,'different ignored previous context'),record('00001','ACME GROUP','001',100,'EAD Increase (STD)',15),record('00001','ACME GROUP','001',100,'Maturity Increase',5),record('00001','ACME GROUP','002',200,'EAD Increase (STD)',20),record('00001','ACME GROUP','002',200,'Maturity Increase',10),record('00002','ACME GROUP','003',400,'EAD Increase (STD)',40),record('00002','ACME GROUP','003',400,'Maturity Increase',10)]
 with raw.open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.DictWriter(f,headers);w.writeheader();w.writerows(rows)
 cmd=[sys.executable,str(ROOT/'data_builder/build_tableau_csv.py'),'--input',str(raw),'--config',str(ROOT/'data_builder/data_mapping.example.json'),'--input-unit','base','--currency','USD','--output-dir',str(t/'out')]
 p=subprocess.run(cmd,capture_output=True,text=True);assert p.returncode==0,p.stderr
 node=subprocess.run(['node',str(ROOT/'tests/builder_integration.mjs'),str(t/'out/tableau_data.csv')],cwd=ROOT,capture_output=True,text=True)
 assert node.returncode==0,node.stdout+node.stderr
 print(node.stdout)
