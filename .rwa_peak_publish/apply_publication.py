#!/usr/bin/env python3
"""One-time, hash-guarded publication of the already delivered RWA patch.
Runs only on a temporary staging checkout. It never pushes main.
"""
from pathlib import Path, PurePosixPath
import ast, base64, hashlib, json, lzma, os, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'rwa_latest'
BASE = 'c48bb72b6cafd24c8f5f069feeefc72112a38f33'
TRANSFER_SHA = '91d6f2eedb24775630c07bca4bc5e42a37a01165a06f1e727909bd2a86494ef6'
JSON_SHA = '2f526491ababf09806f5c3bf254ef656169571b1a67e84e355ae10825d336324'
DELIVERY_SHA = 'dac5ffc730abf5a0583e01a77832366751c9d37b9382cd9f7014c09b545c09c3'
ENV = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1'}
sha = lambda data: hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def safe(rel):
    p = PurePosixPath(rel)
    if p.is_absolute() or '..' in p.parts or '\\' in rel or not p.parts:
        raise ValueError('Unsafe publication path: ' + rel)
    target = WEB.joinpath(*p.parts)
    if not target.resolve().is_relative_to(WEB.resolve()):
        raise ValueError('Outside publication folder')
    if any(q.is_symlink() for q in [target, *target.parents]):
        raise ValueError('Symlink publication target')
    return target

def files():
    result = {}
    for p in WEB.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(WEB).as_posix()
        if '.rule_manager' in p.parts or '__pycache__' in p.parts:
            continue
        result[rel] = p.read_bytes()
    return result

def write_json(rel, data):
    p = safe(rel); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

assert WEB.is_dir()
assert git('merge-base', '--is-ancestor', BASE, 'HEAD') == b''
assert git('status', '--porcelain') == b'', 'Staging checkout is not clean'
assert git('diff', '--name-only', BASE, 'HEAD', '--', 'rwa_latest') == b''
before = files()
tracked_outside = {p: git('hash-object', p).strip().decode() for p in git('ls-files').decode().splitlines() if not p.startswith('rwa_latest/')}
text = ''.join((ROOT / '.rwa_peak_publish' / f'chunk{i}.b64').read_text(encoding='ascii') for i in range(5))
assert sha(text.encode('ascii')) == TRANSFER_SHA, 'Transfer text checksum'
raw = lzma.decompress(base64.b64decode(text, validate=True))
assert sha(raw) == JSON_SHA, 'Decoded payload checksum'
operations = json.loads(raw)
assert len(operations) == 55
assert len({o['path'] for o in operations}) == len(operations)
planned = {}
for op in operations:
    rel = op['path']; safe(rel)
    assert not rel.startswith('screenshots/')
    if 'edits' in op:
        source = before[rel]
        assert sha(source) == op['before'], 'Changed base: ' + rel
        lines = source.decode('utf-8').splitlines(keepends=True)
        for i, j, replacement in reversed(op['edits']):
            assert 0 <= i <= j <= len(lines)
            lines[i:j] = [replacement]
        data = ''.join(lines).encode('utf-8')
    elif 'copy' in op:
        data = before[op['copy']]
    else:
        data = op['text'].encode('utf-8')
    assert sha(data) == op['after'], 'Delivered bytes mismatch: ' + rel
    if rel in before and 'before' not in op:
        assert before[rel] == data, 'Unexpected existing path: ' + rel
    planned[rel] = data
for rel, data in planned.items():
    p = safe(rel); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)

checks = []
def run(args, cwd, label, timeout=300):
    p = subprocess.run(args, cwd=cwd, env=ENV, capture_output=True, text=True, timeout=timeout)
    checks.append({'name': label, 'command': args, 'exit_code': p.returncode,
                   'output_tail': (p.stdout + '\n' + p.stderr)[-1800:]})
    print(label, ':', p.returncode, flush=True)
    if p.returncode:
        print(p.stdout[-2500:]); print(p.stderr[-2500:])
        raise RuntimeError('Publication validation failed: ' + label)
    return p

run([sys.executable, 'install_historical_peak.py'], WEB, 'Install into existing canonical CSVs')
run([sys.executable, 'build_command_patterns.py', '--check'], WEB, 'Existing compiler validation')
syntax = []
for rel in planned:
    p = safe(rel)
    if p.suffix == '.py':
        ast.parse(p.read_text(encoding='utf-8'), filename=rel); syntax.append(rel)
    elif p.suffix in ('.js', '.mjs'):
        run(['node', '--check', str(p)], WEB, 'Syntax ' + rel); syntax.append(rel)

with tempfile.TemporaryDirectory(prefix='rwa-publication-tests-') as td:
    testroot = Path(td) / 'project'
    shutil.copytree(WEB, testroot, ignore=shutil.ignore_patterns('.rule_manager', '__pycache__'))
    run(['node', 'tests/peak_chat_checks.mjs'], testroot, 'Historical peak and display checks')
    peak = json.loads((testroot/'reports/chat_ux/peak_checks.json').read_text())
    assert peak['failed'] == 0
    run([sys.executable, 'tests/test_peak_installation.py', '-q'], testroot, 'Migration, preservation and rollback tests')
    regression = {}
    for corpus in ['questions', 'robustness']:
        out = Path(td) / (corpus + '.json')
        run(['node', 'tools/evaluate.mjs', 'tests/' + corpus + '.csv', str(out)], testroot, 'Existing ' + corpus + ' regression')
        d = json.loads(out.read_text()); assert d['failed'] == 0
        regression[corpus] = {k: d[k] for k in ('total','passed','failed')}
    run(['node', 'tests/connected_tableau.mjs'], testroot, 'Existing mocked Tableau provider tests')
    d = json.loads((testroot/'reports/connected_tests.json').read_text())
    provider = {k: d[k] for k in ('total','passed','failed')}; assert provider['failed'] == 0
    run([sys.executable, '-m', 'unittest', 'local_manager_tests.test_manager', 'simple_manager_tests.test_capabilities', '-q'], testroot, 'Existing manager regression', timeout=420)

run([sys.executable, 'tools/build_standalone.py', '--web', str(WEB)], WEB, 'Rebuild synthetic standalone demo')
assert (WEB/'standalone_demo.html').stat().st_size > 100000
if (WEB/'.rule_manager').exists(): shutil.rmtree(WEB/'.rule_manager')
for p in list(WEB.rglob('__pycache__')): shutil.rmtree(p)

preserved = json.loads((WEB/'verification_summary.json').read_text())['preservation']
for rel, info in preserved.items():
    assert sha(safe(rel).read_bytes()) == info['sha256'], 'Preservation check: ' + rel
config = json.loads((WEB/'tableau_config.txt').read_text())
assert config['mode'] == 'sample' and config['liveReviewAcknowledged'] is False
assert config['apiUrl'] is None and 'YOUR_TABLEAU_SERVER' in config['tableauUrl']
assert all(not p.endswith(('.png','.jpg','.jpeg','.gif','.webp','.zip')) for p in planned)

guide = WEB/'UPDATE_6_0_12_KO.md'
old = guide.read_text(encoding='utf-8')
assert '## 1. 패치에 포함된 기능' in old
preamble = '''# 6.0.12 업데이트 변경 내역 및 사용 안내

## 소스 반영 상태

이 디렉터리에는 채팅 UX와 과거 월별 RWA 증감률 최고/최저 보고서의 개별 소스가 포함되어 있습니다. 이전 안내서만 추가한 상태를 대체합니다.

- 대상: `carloskmhan/jsfile`, `rwa_latest/`
- 런타임 기준: `bfd51962a6a760c0bafd161b0bdbc2c478a8bb00`
- 이번 적용 전 기준: `c48bb72b6cafd24c8f5f069feeefc72112a38f33`
- 버전: `6.0.12-history-percent-review / 6.0.11-chat-ux`
- 실행 파일과 새 보고서 정의를 함께 반영하고 `command_patterns.txt`를 재생성했습니다. ZIP이나 압축 해제 프로그램만 올린 구성이 아닙니다.

새로 전체 폴더를 내려받은 경우 새 보고서는 이미 설치되어 있습니다. 기존 로컬 사용자 규칙을 보존하며 업데이트하는 경우에는 수정 소스를 반영한 뒤 `python install_historical_peak.py`를 실행하십시오. GitHub의 샘플 규칙으로 기존 사용자 규칙 폴더를 덮어쓰지 마십시오.

실제 변경 목록은 `PUBLICATION_6_0_12_FILES.json`, 이번 게시 검증은 `reports/publication_6_0_12.json`을 확인하십시오. 기존 `reports/chat_ux/`는 전달 패치의 과거 개발 검증입니다. 실제 은행 Tableau/SSO 검증이나 자동 사내 배포를 뜻하지 않습니다.

'''
new = preamble + old[old.index('## 1. 패치에 포함된 기능'):]
new = new.replace('위 목록은 **패치의 수정 대상**이며 이 안내서 커밋에서 실제 수정한 프로그램 파일 목록이 아닙니다.', '위 목록은 전달 패치의 변경 소스입니다. 실제 Git 변경에는 생성 규칙, 단일 데모, 게시 문서와 검증 목록도 포함됩니다.')
guide.write_text(new, encoding='utf-8')
p = WEB/'PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md'
s = p.read_text(encoding='utf-8')
s = s.replace('This turn provides a download patch; it does not claim a GitHub commit or automatic bank deployment.', 'This document originated with the downloadable patch. The expanded source is now included in this repository; see reports/publication_6_0_12.json for publication-only checks. Publishing source is not automatic bank deployment.')
p.write_text(s, encoding='utf-8')
p = WEB/'README.md'; s = p.read_text(encoding='utf-8')
s += '\n\n## 6.0.12 chat UX and historical monthly percentage peaks\n\nThe current source includes aligned confirmation buttons, immediate scrolling, progressive display of completed answers, 20 clickable examples, folded routine calculation notes, and the historical highest/lowest monthly percentage report. The checked-in CSVs and generated rules are upgraded together. Existing local customised projects should merge the changed sources and run `python install_historical_peak.py`, rather than replace their own rule CSVs. Read [UPDATE_6_0_12_KO.md](UPDATE_6_0_12_KO.md) and [PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md](PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md). Actual changes are listed in `PUBLICATION_6_0_12_FILES.json`. Live configuration and data are not included.\n'
p.write_text(s, encoding='utf-8')
report = {'edition':'6.0.12-publication','base_commit':BASE,'delivered_zip_sha256':DELIVERY_SHA,
          'delivered_payload_files':len(planned),'exact_delivered_bytes_verified_before_publication_docs':True,
          'syntax_files':len(syntax),'historical_peak_checks':{'passed':peak['passed'],'failed':peak['failed']},
          'regression':regression,'mocked_provider':provider,'commands':checks,
          'browser_rerun':False,'bank_tableau_sso_tested':False,
          'full_legacy_aggregate_runner_rerun':False,
          'known_limit':'Legacy aggregate runner has a previously documented stale comparison-note display assertion; no test threshold was relaxed.',
          'preserved_files':list(preserved),'historical_reports_not_relabelled_as_current':True}
for c in report['commands']:
    c['output_tail'] = c['output_tail'].replace(str(ROOT), '<checkout>')
    c['command'] = [v.replace(str(ROOT), '<checkout>') for v in c['command']]
    for key in ('output_tail',):
        import re
        c[key] = re.sub(r'/tmp/rwa-[^\s]+', '<temporary-test-path>', c[key])
    c['command'] = [re.sub(r'/tmp/rwa-[^\s]+','<temporary-test-path>',v) for v in c['command']]
write_json('reports/publication_6_0_12.json', report)

for p, h in tracked_outside.items(): assert git('hash-object',p).strip().decode() == h, p
now = files()
assert not (set(before)-set(now)), 'Unexpected file deletion'
allowed = set(planned) | {'rules/commands.csv','rules/synonyms.csv','command_patterns.txt','standalone_demo.html','README.md','UPDATE_6_0_12_KO.md','reports/publication_6_0_12.json','UPLOAD_MANIFEST.json','SHA256SUMS.txt','PUBLICATION_6_0_12_FILES.json'}
assert all(p in allowed for p in now if before.get(p) != now[p]), 'Unexpected source change'
meta = {'UPLOAD_MANIFEST.json','SHA256SUMS.txt','PUBLICATION_6_0_12_FILES.json'}
changed = {p: ('modified' if p in before else 'added') for p,b in now.items() if before.get(p)!=b}
for p in meta: changed[p] = 'modified' if p in before else 'added'
listing = {'base_commit':BASE,'destination':'rwa_latest/','format':'individual files','removed':[],
           'modified':sorted(p for p,s in changed.items() if s=='modified'),
           'added':sorted(p for p,s in changed.items() if s=='added'),
           'total_changed':len(changed),'note':'Original delivery FILES_CHANGED.json is a patch inventory. This is the complete publication change list including installed CSVs and generated files.'}
write_json('PUBLICATION_6_0_12_FILES.json',listing)
manifest = json.loads((WEB/'UPLOAD_MANIFEST.json').read_text())
manifest.setdefault('incremental_updates',[]).append({'name':'6.0.12-history-percent-review / 6.0.11-chat-ux',
    'base_commit':BASE,'delivered_zip_sha256':DELIVERY_SHA,'changed_files':'PUBLICATION_6_0_12_FILES.json',
    'publication_checks':'reports/publication_6_0_12.json','canonical_csv_installation':True,'real_tableau_or_sso_tested':False})
manifest['files'] = {p:sha(b) for p,b in sorted(files().items()) if p not in {'UPLOAD_MANIFEST.json','SHA256SUMS.txt'}}
write_json('UPLOAD_MANIFEST.json',manifest)
(WEB/'SHA256SUMS.txt').write_text(''.join(sha(b)+'  '+p+'\n' for p,b in sorted(files().items()) if p != 'SHA256SUMS.txt'), encoding='utf-8')
for rel,b in planned.items():
    if rel not in {'PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md'}:
        assert safe(rel).read_bytes() == b, 'Delivered source changed unexpectedly: '+rel
actual = {p for p,b in files().items() if before.get(p)!=b}
assert actual == set(changed), 'Publication inventory mismatch'
print(json.dumps({'modified':len(listing['modified']),'added':len(listing['added']),'total':len(changed),'ready_for_staging_commit':True}), flush=True)
