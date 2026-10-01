"""Optional, bounded language extension. Does not change the seven legacy CSVs."""
from __future__ import annotations
import csv, hashlib, re

OPTIONAL_HEADERS = {
    'lexical_families.csv': 'family_id,phrase,enabled,notes'.split(','),
    'composition_rules.csv': 'rule_id,shape,enabled,notes'.split(','),
}
FAMILIES = {
    'RISE': ('INCREASE', 'MOTION_UP'),
    'FALL': ('DECREASE', 'MOTION_DOWN'),
    'CAUSE': ('ROOT', 'ATTRIBUTION'),
    'CONTRIBUTION': ('AMOUNT', 'CONTRIBUTION'),
    'POLITE': ('COURTESY', 'COURTESY'),
    'SUBJECT_LINK': ('TECHNICAL', 'SUBJECT_LINK'),
    'PATCH_LINK': ('TECHNICAL', 'PATCH_LINK'),
}
SHAPES = {
    'ATTRIBUTION': ['GROUP_ROOT_CAUSE', 'ENTITY_DRIVER', 'MAIN_DRIVER'],
    'MOVEMENT_CHECK': ['MOVEMENT_CHECK', 'DRIVER_CHECK'],
    'CONTRIBUTION': ['DRIVER_CONTRIBUTION', 'ENTITY_CONTRIBUTION'],
    'RANKING': ['TOP_CLIENTS', 'TOP_ENTITY'],
    'CONTEXT_MODIFIER': ['GROUP_ROOT_CAUSE', 'ENTITY_DRIVER', 'TOP_CLIENTS', 'TOP_ENTITY'],
}
# An extension must not hide a financial qualifier, identifier, date or negation.
PROTECTED_WORDS = set(('not no never without except excluding exclude include only net gross '
    'cumulative forecast predict future if unless assuming balance percentage percent absolute '
    'rwa ead pd lgd fx cg maturity january february march april may june july august september '
    'october november december').split())

def compile_composition(root, synonyms):
    present = [name for name in OPTIONAL_HEADERS if (root/name).exists()]
    if not present:
        return {}, {}
    if set(present) != set(OPTIONAL_HEADERS):
        raise ValueError('Composition CSVs are optional as a pair; provide both lexical_families.csv and composition_rules.csv.')
    tables = {}
    for name, header in OPTIONAL_HEADERS.items():
        path = root/name
        if not path.is_file() or path.stat().st_size > 200_000:
            raise ValueError(name + ': invalid file or 200 KB limit exceeded.')
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream, strict=True)
            if reader.fieldnames != header:
                raise ValueError(name + ': expected header ' + ','.join(header))
            rows = []
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(name + ': CSV column mismatch.')
                row = {key:value.strip() for key,value in row.items()}
                if not any(row.values()):
                    continue
                if any('\x00' in v or len(v)>1000 or v.startswith(('=', '+', '@')) for v in row.values()):
                    raise ValueError(name + ': unsafe or oversized cell.')
                if row['enabled'] not in ('true','false','1','0'):
                    raise ValueError(name + ': enabled must be true/false or 1/0.')
                row['enabled'] = row['enabled'] in ('true','1')
                row['source'] = {'file':name, 'line':reader.line_num}
                rows.append(row)
            if len(rows) > (256 if name=='lexical_families.csv' else 16):
                raise ValueError(name + ': bounded rule count exceeded.')
            tables[name] = rows
    exact = {s['phrase']:s['concept'] for s in synonyms if s['enabled']}
    seen = set()
    for row in tables['lexical_families.csv']:
        phrase, family = row['phrase'], row['family_id']
        if family not in FAMILIES or not re.fullmatch(r'[a-z]+(?: [a-z]+){0,3}', phrase) or len(phrase)>64:
            raise ValueError('lexical_families.csv: unknown family or invalid literal phrase.')
        if family in ('SUBJECT_LINK','PATCH_LINK') and phrase != {'SUBJECT_LINK':'whose','PATCH_LINK':'but'}[family]:
            raise ValueError('lexical_families.csv: structural links use reviewed literal syntax only.')
        if set(phrase.split()) & PROTECTED_WORDS:
            raise ValueError('lexical_families.csv: protected qualifier cannot be consumed by an extension.')
        if phrase in seen:
            raise ValueError('lexical_families.csv: duplicate/conflicting phrase ' + phrase)
        seen.add(phrase)
        row['concept'], row['role'] = FAMILIES[family]
        if phrase in exact and exact[phrase] != row['concept']:
            raise ValueError('lexical_families.csv: conflicts with existing synonym ' + phrase)
    ids, shapes = set(), set()
    for row in tables['composition_rules.csv']:
        if not re.fullmatch(r'[A-Z][A-Z0-9_]{1,63}',row['rule_id']) or row['rule_id'] in ids or row['shape'] not in SHAPES or row['shape'] in shapes:
            raise ValueError('composition_rules.csv: invalid/duplicate ID or shape.')
        ids.add(row['rule_id']); shapes.add(row['shape'])
        row['actions'] = SHAPES[row['shape']]
    extension = {'schemaVersion':1, 'maxMatches':16, 'maxCandidates':4,
        'lexicalFamilies':tables['lexical_families.csv'], 'rules':tables['composition_rules.csv']}
    hashes = {name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in OPTIONAL_HEADERS}
    return {'composition':extension}, hashes
