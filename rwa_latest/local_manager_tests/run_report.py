from pathlib import Path
import io,json,sys,unittest,time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
started=time.perf_counter();suite=unittest.defaultTestLoader.loadTestsFromName('local_manager_tests.test_manager')
stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
out=ROOT/'local_manager_reports';out.mkdir(exist_ok=True)
(out/'backend_tests.log').write_text(stream.getvalue())
report={'suite':'Local manager compiler, persistence, conflict, recovery and loopback HTTP regression',
        'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),
        'passed':result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),'seconds':time.perf_counter()-started,
        'scope':'Temporary project copies; actual existing Python compiler and actual loopback HTTP API. Not a penetration test or live bank deployment test.',
        'failureDetails':[{'test':str(t),'traceback':s} for t,s in result.failures+result.errors]}
(out/'backend_tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(not result.wasSuccessful())
