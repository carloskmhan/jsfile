"""One-time, hash-locked publication of patches already delivered to the user.
This helper runs only on staging; only rwa_latest is later published to main.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'rwa_latest'
PATCHES = json.loads((Path(__file__).parent / 'edits.json').read_text(encoding='utf-8'))
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def inventory():
    return {p.relative_to(WEB).as_posix(): sha(p.read_bytes()) for p in sorted(WEB.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}

before = inventory()
prepared = {}
for patch in PATCHES:
    path = WEB / patch['path']
    raw = path.read_bytes()
    if sha(raw) != patch['before']:
        raise RuntimeError('Unexpected current source; refusing to overwrite: ' + patch['path'])
    lines = raw.decode('utf-8').splitlines(keepends=True)
    for start, end, text in reversed(patch['edits']):
        lines[start:end] = text.splitlines(keepends=True)
    output = ''.join(lines).encode('utf-8')
    if sha(output) != patch['after']:
        raise RuntimeError('Patch does not match delivered file: ' + patch['path'])
    prepared[path] = output
for path, raw in prepared.items():
    path.write_bytes(raw)
for name in ('app.js', 'rwa_engine.js', 'semantic/dictionary.js'):
    subprocess.run(['node', '--check', str(WEB / name)], check=True)
subprocess.run([sys.executable, str(WEB / 'build_command_patterns.py'), '--check'], cwd=WEB, check=True)
subprocess.run([sys.executable, str(WEB / 'tools/build_standalone.py'), '--web', str(WEB)], cwd=WEB, check=True)

notes = '''# Run report feedback, Group IDs and registered-phrase correction

Published as individual source files. The four runtime files are byte-identical to the incremental patches already delivered in the conversation:

- app.js: Run report shows an inline spinner and Running... while checking scope and calculating. Existing one-shot confirmation, stale-preview checks and error handling remain.
- loading_screen.css: legible pending-button state and reduced-motion support. Existing SSO splash and wave-dot styles remain.
- rwa_engine.js: group-ranking prose and tables include the supplied Group ID, including leading zeros. Ranking arithmetic and material warnings are unchanged.
- semantic/dictionary.js: the previously delivered registered multi-word expression correction, so take me through does not match a weak take customer-name fragment first. Exact IDs, full names and real ambiguities remain protected.

Deploy the three root-level files together; keep the dictionary correction under semantic/. Preserve your local rule CSVs, generated command_patterns.txt and Tableau configuration. No rule recompilation is required for these source patches. Restart rule_manager.py when testing its cached modules; refresh the web page after deployment.

The synthetic standalone_demo.html was regenerated from the same current modules. It is not a live Tableau demo. Customer screenshots, credentials, live CSV exports and internal URLs were not included in this update.

Publication validation: before/after SHA-256 checks against delivered sources, JavaScript syntax checks, existing compiler validation, generated-demo rebuild, and unchanged-file checks. Full regression suites and real bank Tableau/SSO were NOT rerun for this upload. Earlier test evidence remains historical.
'''
(WEB / 'PATCH_RUN_REPORT_UI.md').write_text(notes, encoding='utf-8', newline='\n')
allowed = {p['path'] for p in PATCHES} | {'standalone_demo.html', 'PATCH_RUN_REPORT_UI.md', 'UPLOAD_MANIFEST.json', 'SHA256SUMS.txt'}
current = inventory()
for name, digest in before.items():
    if name not in allowed and current.get(name) != digest:
        raise RuntimeError('Unexpected source modification: ' + name)
if set(current) - set(before) - allowed:
    raise RuntimeError('Unexpected additional published files')

manifest_path = WEB / 'UPLOAD_MANIFEST.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest.setdefault('incremental_updates', []).append({
    'name': '6.0.10-report-ui with 6.0.9-phrase-ownership',
    'base_commit': '1422172fd49f0483f64920a3c07ce4aa23982b65',
    'delivered_file_sha256': {p['path']: p['after'] for p in PATCHES},
    'publication_checks': ['exact delivered-file hashes', 'JavaScript syntax', 'existing compiler --check', 'standalone rebuild', 'unrelated files unchanged'],
    'full_regression_rerun': False,
    'real_tableau_or_sso_tested': False
})
manifest['files'] = {name: digest for name, digest in inventory().items() if name not in {'UPLOAD_MANIFEST.json', 'SHA256SUMS.txt'}}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
checks = inventory()
(WEB / 'SHA256SUMS.txt').write_text(''.join(digest + '  ' + name + '\n' for name, digest in sorted(checks.items()) if name != 'SHA256SUMS.txt'), encoding='utf-8', newline='\n')
for patch in PATCHES:
    assert sha((WEB / patch['path']).read_bytes()) == patch['after']
for name, digest in before.items():
    if name not in allowed:
        assert sha((WEB / name).read_bytes()) == digest
print('PASS: four exact source patches, generated demo, notes and checksums. Unrelated files unchanged.')
