#!/usr/bin/env python3
"""One-time additive 6.1 -> 6.2 CSV migration; keeps custom rules and disabled shapes.
Stop the Rule Manager first. Uses its OS lock, compiler, journal and rollback.
"""
from pathlib import Path
import argparse, csv, io, json
from rule_manager import Workbench

ADDITIONS = [
    ('PLAN_RANKING_ROLES','RANKING_ROLES','Bind ranking metric and balance predicate before command selection.'),
    ('PLAN_COMPOUND_CONTEXT','COMPOUND_CONTEXT','Atomically validate scope period and driver changes through existing context handlers.'),
    ('PLAN_ACCEPTED_AUDIT','ACCEPTED_AUDIT','Observe undefined net/gross and role disagreements without changing accepted legacy output.'),
]

def upgrade(root: Path):
    wb=Workbench(root)
    try:
        with wb.lock:
            before=wb.read_bytes_map();revision=wb.revision_of(before)
            path='rules/composition_rules.csv';raw=before[path]
            if raw is None or before['rules/lexical_families.csv'] is None:
                raise ValueError('The optional 6.1 composition CSV pair is required before this additive migration.')
            rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'),newline='')))
            new=[]
            for rule_id,shape,notes in ADDITIONS:
                by_id=[r for r in rows if r.get('rule_id')==rule_id]
                by_shape=[r for r in rows if r.get('shape')==shape]
                if by_id and any(r.get('shape')!=shape for r in by_id):
                    raise ValueError('Conflicting existing rule ID: '+rule_id+'. No source was overwritten.')
                if by_shape:continue  # Preserve custom IDs and intentionally disabled existing shapes.
                new.append([rule_id,shape,'true',notes])
            after=dict(before)
            if new:
                s=io.StringIO(newline='');w=csv.writer(s,lineterminator='\n');w.writerows(new)
                after[path]=raw+(b'' if raw.endswith((b'\n',b'\r')) else b'\n')+s.getvalue().encode('utf-8')
            generated,log,_=wb.compile_blobs(after);after['command_patterns.txt']=generated
            if after==before:return {'changed':False,'addedShapes':[],'backupId':None}
            backup=wb.write_transaction(after,revision,'Add reviewed 6.2 semantic planning shapes; preserve custom CSVs')
            return {'changed':True,'addedShapes':[r[1] for r in new],'backupId':backup,'compiler':log}
    finally:wb.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',type=Path,default=Path(__file__).resolve().parent)
    args=p.parse_args()
    try:print(json.dumps(upgrade(args.project),indent=2))
    except Exception as error:p.exit(1,'Migration stopped without an unvalidated source replacement: '+str(error)+'\n')
