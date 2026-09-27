#!/usr/bin/env python3
"""Assemble the existing RWA sources; no downloads, credentials, or financial changes."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import shutil
import stat
import subprocess
import sys
import zipfile

ROOT = Path.cwd()
OUT = ROOT / 'rwa_latest'
SOURCE_COMMIT = '6fba02dc628715613c139edf4cd63b890221bb7b'
EXPECTED = {
    'RWA_v6_full.zip': '57f1a6338b2a70295836e985a74d5d5ee643522ad550f5c4db41ec54d0be7990',
    'rwa_v6_sso_startup_patch.zip': '9faffc5762a03826cdb9442b9c6dbad09e06c34ab0d36fc080394dd13f9ca323',
    'rwa_simple_rule_manager_patch.zip': '9320e2221d64c6b76f0c029b2471055959ae1f95a49eef3878645db6e7dca5ce',
    'group_catalog.js.txt': '9fdfbb74cb95a7f85b05636f8a1500ab0c0f9ce70dec163b69808c55b5a9e266',
    'rwa_engine.js.txt': 'a15b9bdec2d6b71042b74c78d1e7df412c68790ee2a436a90a11d30d0689f210',
    'build_tableau_csv.py': '6b3c9cabc52fd52e61589c691dc11b4bcd8779723754259ecf702ec6b09cfa27',
}
EXCLUDED_SUFFIXES = {'.zip', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.pyc', '.pyo'}
excluded = []

def sha(data):
    return hashlib.sha256(data).hexdigest()

def write(rel, data):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)

def text(rel, content):
    write(rel, content.encode('utf-8'))

def extract(name, prefix=''):
    with zipfile.ZipFile(ROOT / name) as z:
        if z.testzip() is not None:
            raise RuntimeError('Invalid ZIP: ' + name)
        for item in z.infolist():
            if item.is_dir():
                continue
            if not item.filename.startswith(prefix):
                raise RuntimeError('Unexpected archive root')
            rel = item.filename[len(prefix):]
            path = PurePosixPath(rel)
            if (not rel or path.is_absolute() or '..' in path.parts or
                    '\\' in rel or ':' in rel or stat.S_ISLNK(item.external_attr >> 16)):
                raise RuntimeError('Unsafe archive entry: ' + rel)
            if path.suffix.lower() in EXCLUDED_SUFFIXES or any(
                    p in {'__pycache__', '.rule_manager', '.git', 'node_modules'} for p in path.parts):
                excluded.append({'archive': name, 'entry': rel})
                continue
            if rel == 'verification_summary.json':
                rel = 'validation_history/sso_startup.json'
            data = z.read(item)
            data.decode('utf-8-sig')
            write(rel, data)

if OUT.exists():
    raise SystemExit('Refusing to replace an existing rwa_latest folder')
for name, expected in EXPECTED.items():
    p = ROOT / name
    if not p.is_file() or sha(p.read_bytes()) != expected:
        raise SystemExit('Source fingerprint mismatch: ' + name)
OUT.mkdir()
extract('RWA_v6_full.zip', 'rwa_tableau_connected_v6/')
extract('rwa_v6_sso_startup_patch.zip')
extract('rwa_simple_rule_manager_patch.zip')
for source, target in [
        ('group_catalog.js.txt', 'group_catalog.js'),
        ('rwa_engine.js.txt', 'rwa_engine.js'),
        ('build_tableau_csv.py', 'data_builder/build_tableau_csv.py')]:
    write(target, (ROOT / source).read_bytes())

mapping = OUT / 'data_builder/data_mapping.json'
if mapping.exists():
    example = OUT / 'data_builder/data_mapping.example.json'
    if not example.exists():
        shutil.copyfile(mapping, example)
    mapping.unlink()

old_readme = (OUT / 'README.md').read_text(encoding='utf-8')
text('README_V6_BASE.md', old_readme.replace('990371260', 'CG0001'))
text('README.md', '''# RWA deterministic engine - current consolidated sources

This directory contains the complete expanded source project, not an archive or an unpack-only bundle. Existing files at the repository root are unchanged. Start here rather than mixing historical root-level JavaScript files with this folder.

## Run the simple rule manager

```bash
cd rwa_latest
python rule_manager.py
```

Open http://127.0.0.1:8765/ . The home page provides Search, Add / Edit / Delete, Test engine and Fix interpretation. The old technical editor is under Advanced. Python 3.10+ is required; the ordinary manager does not require pip, Node, or a model.

## Preview the Q&A application

```bash
cd rwa_latest
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/demo.html . The separate standalone_demo.html is rebuilt from these modules with synthetic data for offline preview. Local development servers are not shared production servers.

## Included revisions

- Two Tableau worksheets: RWA_GROUP_INDEX for available names/IDs; RWA_DATA for complete detailed JSON.
- Sign In inside the five-second startup cover; the same Tableau iframe is hidden after successful initialization and remains the data connection.
- Query wave dots, batch progress, configurable batches up to 10,000, separate API/batch/total time budgets, and complete-response validation.
- Group-name token correction, including the false `for` alias collision fix.
- Multiple main contributing drivers and offsets, with a table.
- Repetitive long comparison-basis notes hidden from ordinary prose; provenance and material warnings retained.
- The simple English capability-management wizard over the existing CSV/compiler architecture.
- Builder 1.0.9-diagnostics in data_builder/.

## Configuration

The checked-in tableau_config.txt deliberately remains `sample` mode with placeholder URLs and live review acknowledgement false. Preserve your own approved bank settings outside this public source snapshot. Read TABLEAU_SETUP.md and PATCH_SSO_STARTUP.md before configuring the live connection. Both worksheets belong in the embedded dashboard and keep server-side RLS. Hiding the iframe is not authorization.

The ordinary rule source is the seven CSV files under rules/. The existing Python compiler generates command_patterns.txt. Customer names in live mode come from Tableau, not aliases.csv. The manager creates its management-only capability CSVs on the first explicit save; no separate database is introduced.

For conversion, copy data_builder/data_mapping.example.json to your local ignored data_builder/data_mapping.json and adapt your actual column headers. Do not overwrite an existing working mapping with the sample.

## Public snapshot and validation boundaries

Data shipped here are the synthetic development fixtures from the supplied v6 package. No live customer export, internal bank URL, credential, token, or screenshot is included in the assembled directory. Do not commit real CSV inputs, financial outputs, local settings or .rule_manager backups. Existing repository-root content is not changed or certified by this publication.

UPLOAD_MANIFEST.json records source archive fingerprints and individual file hashes. SHA256SUMS.txt verifies the expanded files. Reports under reports/, simple_manager_reports/ and validation_history/ are historical development evidence, not a new claim of bank UAT or production approval. PUBLICATION_NOTES.md records known limits. No safety threshold or financial aggregation rule was changed for upload.

See SIMPLE_RULE_MANAGER.md for management, README_V6_BASE.md for the base design, and PUBLICATION_NOTES.md before running the legacy aggregate test runner.
''')
text('PUBLICATION_NOTES.md', '''# Publication notes

This is a source consolidation, not a new engine release or a fix to the source data.

The following latest functional files were overlaid without changing their contents: SSO startup files; the corrected group_catalog.js; the main-contributors/comparison-note rwa_engine.js; the latest current-snapshot diagnostic data builder; the simplified manager patch.

The builder still rejects conflicting current RWA/current attributes for one group + LEID + reporting month. Raw prev_* values are ignored under the existing agreed builder policy. No first/MAX/SUM choice was added to suppress current-side conflicts. Derived previous RWA is a comparison basis, not independently observed prior-month RWA.

## Existing test caveat

The unchanged legacy builder integration assertion requires the long phrase `NOT an independently observed` in ordinary answer prose. The user's earlier display patch intentionally moved that recurring note out of ordinary prose while preserving metadata. The previously recorded manager regression notes identify this stale display assertion. It is not hidden or changed merely to label the entire historical runner green.

The 50,001-name synthetic provider stress case in tests/connected_tableau.mjs can take substantial time. Publication-time execution in this environment was stopped after the local 120-second command budget before that suite reported completion. That interruption is not counted as a pass or a detected product defect. Other source checks and fresh test results, when run, are reported separately.

Historical reports describe their own source snapshots and dates. Real bank Tableau/SSO, entitlement boundaries, response sizes, performance and data completeness require staging validation. This public source snapshot is not bank approval.
''')
text('data_builder/README.md', '''# Tableau CSV data builder

The latest supplied converter is 1.0.9-diagnostics. Its code is unchanged in this consolidation. The diagnostics identify conflicting current RWA, EAD, CG or scorecard values within a group/LEID/reporting month; they do not silently resolve that financial source conflict.

Use your own working data_mapping.json. The provided data_mapping.example.json is only a synthetic column-mapping example. Copy it to data_mapping.json locally only when no working mapping exists. The web browser does not execute this offline converter.
''')
text('.gitignore', '''# Local runtime state and private source data
__pycache__/
*.py[cod]
.venv/
venv/
node_modules/
.rule_manager/
.env
.env.*
*.pem
*.key
output/
output_*/
converted_*/
actual_data/
private_data/
rmi_clients*.csv
raw_data.csv
data_builder/data_mapping.json
tableau_config.local.txt
''')

cfg = json.loads((OUT / 'tableau_config.txt').read_text(encoding='utf-8'))
assert cfg['mode'] == 'sample' and cfg['liveReviewAcknowledged'] is False
assert 'YOUR_TABLEAU_SERVER' in cfg['tableauUrl'] and cfg['apiUrl'] is None
assert cfg.get('additionalAllowedOrigins', []) == []
assert not (OUT / 'rules/aliases.csv').exists()
subprocess.run([sys.executable, str(OUT / 'build_command_patterns.py'), '--check'], check=True)
subprocess.run([sys.executable, str(OUT / 'tools/build_standalone.py'), '--web', str(OUT)], check=True)
for p in list(OUT.rglob('__pycache__')):
    shutil.rmtree(p)
(OUT / 'SHA256SUMS.txt').unlink(missing_ok=True)
files = {}
for p in sorted(OUT.rglob('*')):
    if p.is_file():
        assert p.suffix.lower() not in EXCLUDED_SUFFIXES
        files[p.relative_to(OUT).as_posix()] = sha(p.read_bytes())
manifest = {
    'edition': 'v6-consolidated-simple-manager',
    'source_commit': SOURCE_COMMIT,
    'target_folder': 'rwa_latest',
    'format': 'individual expanded files',
    'source_sha256': EXPECTED,
    'excluded_archived_assets': excluded,
    'runtime_semantics_modified_for_publication': False,
    'configuration': 'synthetic sample / placeholder URLs',
    'historical_reports_are_not_new_validation': True,
    'files': files,
}
text('UPLOAD_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
checksums = []
for p in sorted(OUT.rglob('*')):
    if p.is_file() and p.name != 'SHA256SUMS.txt':
        checksums.append(sha(p.read_bytes()) + '  ' + p.relative_to(OUT).as_posix())
text('SHA256SUMS.txt', '\n'.join(checksums) + '\n')
print('ASSEMBLED_FILES=' + str(len(checksums) + 1))
print('MANIFEST_SHA256=' + sha((OUT / 'UPLOAD_MANIFEST.json').read_bytes()))
