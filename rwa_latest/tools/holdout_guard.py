"""Freeze code BEFORE an independent reviewer supplies gold. Hashes detect edits, not independence.
Example:
 python tools/holdout_guard.py freeze --snapshot reports/frozen_runtime.json
 # reviewer authors new complete-gold tests without tuning the frozen implementation
 python tools/holdout_guard.py seal --snapshot reports/frozen_runtime.json --corpus tests/private_holdout.csv --manifest reports/holdout_manifest.json --reviewer NAME
 python tools/holdout_guard.py verify --corpus tests/private_holdout.csv --manifest reports/holdout_manifest.json
"""
from pathlib import Path
import argparse,csv,hashlib,json,re,sys,unicodedata,datetime
ROOT=Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def runtime_hashes():
    paths=set(ROOT.glob('*.js'))|set((ROOT/'semantic').glob('*.js'))|set((ROOT/'rules').glob('*.csv'))
    paths|={ROOT/n for n in ['command_patterns.txt','tableau_config.txt','rules_config.txt','rwa_sample_data.txt','tableau_sample.csv','tests/fixture.json']}
    return {str(p.relative_to(ROOT)):sha(p) for p in sorted(paths)}
def normalized(s):
    s=unicodedata.normalize('NFKC',s).lower().replace('’',"'").replace('‘',"'")
    return re.sub(r'[^\w\s]','',re.sub(r'\s+',' ',s)).strip()
def cases(p):
    with Path(p).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def validate_corpus(p):
    rows=cases(p)
    if not rows:raise ValueError('No holdout cases supplied. Empty template is not a test set.')
    if any(r.get('split')!='holdout' for r in rows):raise ValueError('All supplied rows must be reviewer-owned split=holdout; never relabel regression rows.')
    known={normalized(r['question']) for fn in ['questions.csv','robustness.csv'] for r in cases(ROOT/'tests'/fn)}
    for r in rows:
        if normalized(r['question']) in known:raise ValueError(f'Known regression overlap: {r.get("id")}. This row is not unseen.')
        if r.get('expected_status')=='ACCEPT' and (r.get('exact_gold')!='true' or any(not v for k,v in r.items() if k.startswith('expected_'))):raise ValueError(f'{r.get("id")}: complete gold is required; use ~ for absent values.')
    return rows

def verify_manifest(corpus,manifest):
    info=json.loads(Path(manifest).read_text());validate_corpus(corpus)
    if info.get('corpusSha256')!=sha(corpus):raise ValueError('Holdout corpus changed after sealing.')
    if info.get('runtimeHashes')!=runtime_hashes():raise ValueError('Runtime/rules/data changed after holdout freeze. Previous holdout is contaminated if used to tune; use a new external set.')
    if not info.get('reviewer'):raise ValueError('Reviewer attestation missing.')
    return info

def write(p,value):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():raise ValueError(f'Refusing to overwrite freeze/manifest: {p}')
    p.write_text(json.dumps(value,indent=2)+'\n')

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['freeze','seal','verify']);p.add_argument('--snapshot',type=Path);p.add_argument('--corpus',type=Path);p.add_argument('--manifest',type=Path);p.add_argument('--reviewer');a=p.parse_args()
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if a.operation=='freeze':
        if not a.snapshot:p.error('--snapshot required')
        write(a.snapshot,{'frozenAt':now,'runtimeHashes':runtime_hashes(),'notice':'Provide this frozen code snapshot to an independent test owner before receiving their corpus.'})
    elif a.operation=='seal':
        if not all([a.snapshot,a.corpus,a.manifest,a.reviewer]):p.error('--snapshot --corpus --manifest --reviewer required')
        frozen=json.loads(a.snapshot.read_text())
        if frozen['runtimeHashes']!=runtime_hashes():raise ValueError('Runtime changed since freeze.')
        rows=validate_corpus(a.corpus)
        write(a.manifest,{**frozen,'sealedAt':now,'reviewer':a.reviewer,'corpusSha256':sha(a.corpus),'caseCount':len(rows),'attestationOnly':True,'notice':'Hash/overlap checks do not prove blindness or reviewer independence. Any tuning after exposure retires this holdout.'})
    else:
        if not a.corpus or not a.manifest:p.error('--corpus --manifest required')
        verify_manifest(a.corpus,a.manifest)
    print(a.operation.upper()+' PASS; this is not an independent-performance certification.')
if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError) as e:print('ERROR: '+str(e),file=sys.stderr);raise SystemExit(1)
