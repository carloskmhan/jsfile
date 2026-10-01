#!/usr/bin/env python3
"""One-time additive 6.2 -> 6.3 semantic-generalization migration.
Preserves custom rules, disabled shapes and existing lexical rows. Uses the existing
Workbench lock/compiler/journal/backup path; it is not an application startup script.
"""
from pathlib import Path
import argparse,csv,io,json
from rule_manager import Workbench

RULES=[
 ('PLAN_REFERENCE_CONTEXT','REFERENCE_CONTEXT','Resolve ranked-result references with a simultaneous reporting-month replacement.'),
 ('PLAN_CONSISTENCY_GATE','CONSISTENCY_GATE','Clarify material legacy/structured semantic disagreements before execution in guarded mode.'),
]
LEXICAL=[
 ('RISE','climbs','Reviewed inflection for existing climb family.'),('RISE','expands','Reviewed inflection for existing expand family.'),
 ('FALL','contracts','Reviewed inflection for existing contract family.'),('CAUSE','triggers','Reviewed inflection for existing trigger family.'),
 ('RISE_LEMMA','surge','Productive reviewed lemma.'),('RISE_LEMMA','soar','Productive reviewed lemma.'),('RISE_LEMMA','accelerate','Productive reviewed lemma.'),
 ('FALL_LEMMA','dip','Productive reviewed lemma.'),('FALL_LEMMA','plunge','Productive reviewed lemma.'),('FALL_LEMMA','tumble','Productive reviewed lemma.'),
 ('CAUSE_LEMMA','fuel','Productive reviewed causal lemma.'),('CAUSE_LEMMA','drive','Productive reviewed causal lemma.'),('CAUSE_LEMMA','push','Productive reviewed causal lemma.'),
 ('CAUSE','lie behind','Reviewed causal phrase family.'),('CAUSE','lies behind','Reviewed causal phrase family.'),('CAUSE','lay behind','Reviewed causal phrase family.'),('CAUSE','lying behind','Reviewed causal phrase family.'),
 ('CAUSE','stem from','Reviewed causal phrase family.'),('CAUSE','stems from','Reviewed causal phrase family.'),('CAUSE','stemmed from','Reviewed causal phrase family.'),('CAUSE','stemming from','Reviewed causal phrase family.'),
 ('CAUSE','result from','Reviewed causal phrase family.'),('CAUSE','results from','Reviewed causal phrase family.'),('CAUSE','resulted from','Reviewed causal phrase family.'),('CAUSE','resulting from','Reviewed causal phrase family.'),
 ('CAUSE_UP','pushed higher','Reviewed combined causal-plus-direction abstraction.'),('CAUSE_UP','pushed up','Reviewed combined causal-plus-direction abstraction.'),
 ('CAUSE_DOWN','pushed lower','Reviewed combined causal-plus-direction abstraction.'),('CAUSE_DOWN','pushed down','Reviewed combined causal-plus-direction abstraction.'),
]

def _append(raw,rows):
    if not rows:return raw
    s=io.StringIO(newline='');csv.writer(s,lineterminator='\n').writerows(rows)
    return raw+(b'' if raw.endswith((b'\n',b'\r')) else b'\n')+s.getvalue().encode('utf-8')

def upgrade(root:Path):
    wb=Workbench(root)
    try:
        with wb.lock:
            before=wb.read_bytes_map();revision=wb.revision_of(before)
            rp='rules/composition_rules.csv';lp='rules/lexical_families.csv'
            if before[rp] is None or before[lp] is None:raise ValueError('The optional 6.2 composition CSV pair is required before this additive migration.')
            rule_rows=list(csv.DictReader(io.StringIO(before[rp].decode('utf-8-sig'),newline='')))
            lex_rows=list(csv.DictReader(io.StringIO(before[lp].decode('utf-8-sig'),newline='')))
            add_rules=[]
            for rule_id,shape,notes in RULES:
                by_id=[r for r in rule_rows if r.get('rule_id')==rule_id];by_shape=[r for r in rule_rows if r.get('shape')==shape]
                if by_id and any(r.get('shape')!=shape for r in by_id):raise ValueError('Conflicting existing rule ID: '+rule_id+'. No source was overwritten.')
                if not by_shape:add_rules.append([rule_id,shape,'true',notes])
            existing={r.get('phrase'):r for r in lex_rows};add_lex=[]
            for family,phrase,notes in LEXICAL:
                if phrase in existing:continue
                add_lex.append([family,phrase,'true',notes])
            after=dict(before);after[rp]=_append(before[rp],add_rules);after[lp]=_append(before[lp],add_lex)
            generated,log,_=wb.compile_blobs(after);after['command_patterns.txt']=generated
            if after==before:return {'changed':False,'addedShapes':[],'addedLexical':0,'backupId':None}
            backup=wb.write_transaction(after,revision,'Add reviewed 6.3 semantic generalization rules; preserve custom CSVs')
            return {'changed':True,'addedShapes':[r[1] for r in add_rules],'addedLexical':len(add_lex),'backupId':backup,'compiler':log}
    finally:wb.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',type=Path,default=Path(__file__).resolve().parent);a=p.parse_args()
    try:print(json.dumps(upgrade(a.project),indent=2))
    except Exception as e:p.exit(1,'Migration stopped without an unvalidated source replacement: '+str(e)+'\n')
