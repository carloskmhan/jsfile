"""Run manager-specific checks. Browser dependencies are optional development tools."""
from pathlib import Path
import argparse,subprocess,sys,json
root=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--browser',action='store_true');ap.add_argument('--regression',action='store_true');args=ap.parse_args()
steps=[[sys.executable,'-m','unittest','simple_manager_tests.test_capabilities','-v'],[sys.executable,'simple_manager_tests/http_workflow.py'],[sys.executable,'-m','unittest','local_manager_tests.test_manager','-q']]
if args.browser:steps += [[sys.executable,'simple_manager_tests/browser_workflow.py'],[sys.executable,'simple_manager_tests/browser_logic.py'],[sys.executable,'local_manager_tests/browser_dom.py'],[sys.executable,'simple_manager_tests/browser_http_attempt.py']]
if args.regression:steps += [['node','tests/run_all.mjs']]
runs=[]
for cmd in steps:
 p=subprocess.run(cmd,cwd=root,capture_output=True,text=True);runs.append({'command':cmd,'exitCode':p.returncode,'stdout':p.stdout[-12000:],'stderr':p.stderr[-12000:]});print(('PASS' if p.returncode==0 else 'FAIL'),' '.join(cmd));
 if p.returncode:print(p.stderr[-3000:])
(root/'simple_manager_reports').mkdir(exist_ok=True)
(root/'simple_manager_reports/last_run.json').write_text(json.dumps({'runs':runs,'browserPolicy':'Inspect browser_http_attempt.json; a blocked environment is NOT a successful browser workflow.'},indent=2))
sys.exit(1 if any(r['exitCode']!=0 for r in runs) else 0)
