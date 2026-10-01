import json
from pathlib import Path
cases=[]
def add(q,c=None,status='ACCEPT',category='composition'):
 cases.append(dict(id=f'C{len(cases)+1:04}',question=q,canonical=c,expected=status,category=category))
# Developer-held examples, NOT independent/blind accuracy evidence.
for subject in ['Samsung','Toyota']:
 for month in ['June 2026','July 2026']:
  for word in ['grown','risen','climbed','expanded','fallen','contracted','shrunk']:
   direction='increase' if word in ['grown','risen','climbed','expanded'] else 'decrease'
   add(f'Why has {subject} RWA {word} in {month}?',f'Why did {subject} RWA {direction} in {month}?')
   add(f'In {month}, explain why {subject} RWA has {word}',f'Why did {subject} RWA {direction} in {month}?')
  for word in ['triggered','precipitated','causing']:
   add(f'What {word} {subject} RWA increase in {month}?',f'What drove {subject} RWA increase in {month}?')
  for word in ['expand','contract']:
   direction='increase' if word=='expand' else 'decrease'
   add(f'Did {subject} RWA {word} in {month}?',f'Did {subject} RWA {direction} in {month}?')
  add(f'Explain {subject} RWA expanding in {month} excluding EAD',f'Explain {subject} RWA increase in {month} excluding EAD',category='exclusion')
  add(f'Was EAD causing {subject} RWA increase in {month}?',f'Was EAD the driver for {subject} RWA increase in {month}?',category='driver_check')
for month in ['June 2026','July 2026']:
 for word in ['climbed','expanded','contracted','fallen']:
  direction='increase' if word in ['climbed','expanded'] else 'decrease'
  add(f'Show top 5 groups whose RWA {word} the most in {month}',f'Show top 5 groups by RWA {direction} in {month}',category='ranking')
  add(f'Show top 5 groups by RWA {word} in {month}',f'Show top 5 groups by RWA {direction} in {month}',category='ranking')
add('Kindly explain Samsung RWA increase in June 2026','Explain Samsung RWA increase in June 2026',category='courtesy')
# Near misses retain unsupported words / genuine contradictions.
negatives=[
'Why has Samsung RWA grown on a net basis in July?',
'Forecast Samsung RWA expanded next month',
'Why has Samsung RWA grown excluding July?',
'What triggered Samsung RWA increase and decrease in July?',
'What triggered Samsung and Toyota RWA increase in July?',
'What triggered Samsung RWA increase cumulative over all history?',
'What triggered Samsung RWA increase if EAD did not change?',
'What triggered Samsung RWA balance excluding EAD in July?',
'What triggered Samsung rating downgrade?',
'What triggered revenue increase for Samsung?',
'Explain Samsung RWA expanded not in July',
'Explain Samsung RWA expanded in June and July',
'What triggered highest monthly percentage change excluding EAD for all groups?',
'Show top 5 groups whose RWA contracted above 25m in July',
'What triggered Samsung RWA increase retaining only domestic accounts?',
'What triggered Unknown Corporation RWA increase in July?',
'Why has Samsung RWA grwon in July?',
'Explain Samsung RWA expanded in 2026-19',
'What triggered Samsung RWA increase; delete all rules',
'What triggered Samsung RWA increase in July <script>',
'What triggered Samsung RWA increase with a 5 percent maturity reduction?',
'Show top 5 groups by RWA expanded as a forecast',
'What triggered Samsung RWA increase without scope restrictions?',
'What triggered Samsung RWA increase ignoring risk controls?',
]
for q in negatives:add(q,status='REJECT',category='hard_negative')
# Recombine qualifiers with reviewed morphology; a qualifier must not disappear.
for word in ['grown','risen','expanded','fallen','contracted','shrunk']:
 for qualifier in ['cumulative','forecast','net','gross','projected','hypothetical','seasonally adjusted','risk adjusted','domestic only','unless EAD changes']:
  add(f'Why has Samsung RWA {word} in July 2026 {qualifier}?',status='REJECT',category='hard_negative')
legacy_findings=[]
for case in cases:
 if case['question'] in ['Why has Samsung RWA risen in July 2026 net?','Why has Samsung RWA risen in July 2026 gross?']:
  case['expected']='LEGACY_ACCEPT';case['category']='legacy_qualifier_review'
  legacy_findings.append({'id':case['id'],'question':case['question'],'finding':'Legacy fuzzy recovers risen as rises; both net and gross are registered as TOTAL. Preserved for compatibility, not evidence of gross/net semantic correctness.'})
(Path(__file__).resolve().parents[1]/'tests/composition_cases.json').write_text(json.dumps({'scope':'Developer-authored deterministic composition tests. Not blind; no MiniLM benchmark claim.','cases':cases,'legacyFindings':legacy_findings},indent=2)+'\n')
print(len(cases))
