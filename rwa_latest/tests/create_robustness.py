"""Developer-authored expected commands. Generated gold comes from explicit cases below, NEVER engine output.
This corpus is regression material, not a blind holdout. Edit cases then review the emitted CSV.
"""
from pathlib import Path
import csv
R=Path(__file__).resolve().parents[1]
EXTRA='expected_excluded_entities expected_threshold_canonical expected_threshold_unit expected_dimension expected_candidate_groups expected_candidate_entities expected_check_mode expected_negated expected_peer expected_concise expected_response_variant'.split()
with (R/'tests/questions.csv').open(encoding='utf-8-sig',newline='') as f:BASE=next(csv.reader(f))
HEAD=BASE+['category','exact_gold']+EXTRA
cases=[]
def gold(action='GROUP_ROOT_CAUSE',**kw):
 g={k:'~' for k in HEAD if k.startswith('expected_')}
 g.update(expected_status='ACCEPT',expected_action=action,expected_group_id='CG0001',expected_period='2026-07',expected_metric='CHANGE',expected_direction='AUTO',expected_top_n='5',expected_check_mode='CONTRIBUTES',expected_negated='false',expected_peer='false',expected_concise='false')
 if action=='TOP_CLIENTS':g.update(expected_group_id='~',expected_dimension='GROUP')
 if action=='TOP_ENTITY':g.update(expected_dimension='ENTITY')
 g.update(kw);return g

def add(q,g=None,category='HARD_NEGATIVE',**meta):
 i=len(cases)+1
 row={k:'' for k in HEAD};row.update(id=f'V5_{i:04}',split='regression',conversation_id=meta.get('conversation',f'V5_S{i}'),turn=meta.get('turn',1),question=q,context_group='SAMSUNG GROUP',context_month='2026-07',category=category,exact_gold='true',notes='Developer-defined full command gold; not blind. No tuning from external user holdout.')
 row.update(g or {'expected_status':'REJECT'});cases.append(row)

def threshold(action='TOP_CLIENTS',value=25,canonical=25000000,unit='absolute',metric='CHANGE',op='GT',**kw):
 return gold(action,expected_threshold_op=op,expected_threshold_value=str(value),expected_threshold_canonical=str(canonical),expected_threshold_unit=unit,expected_threshold_metric=metric,**kw)

# Hard negatives: same vocabulary, different operations and parameters.
add('Why did RWA increase?',gold(expected_direction='UP'))
add('Did RWA increase?',gold('MOVEMENT_CHECK',expected_direction='UP'))
add('Did RWA decrease?',gold('MOVEMENT_CHECK',expected_direction='DOWN'))
add("Didn't RWA increase?",gold('MOVEMENT_CHECK',expected_direction='UP',expected_negated='true'))
add('How much did RWA increase?',gold(expected_direction='UP',expected_response_variant='AMOUNT'))
add('Which group increased the most?',gold('TOP_CLIENTS',expected_direction='UP'))
add('Show groups with increasing RWA.',gold('TOP_CLIENTS',expected_direction='UP'))
add('Compare RWA increases.',{'expected_status':'AMBIGUOUS'})
add("Why didn't RWA increase?")
add('Show top 10 groups.',gold('TOP_CLIENTS',expected_top_n='10'))
add('Show groups above 25m.',threshold())
add('Show top 10 excluding groups below 25m.',threshold(op='GTE',expected_top_n='10'))
add('Compare Samsung and Toyota.',gold('COMPARE',expected_comparison_ids='CG0001|CG0004'))
add('Why did Samsung increase compared with Toyota?',{'expected_status':'AMBIGUOUS'})
add('Was FX the main driver?',gold('DRIVER_CHECK',expected_driver='FX',expected_check_mode='MAIN'))
add('Was FX the only driver?',gold('DRIVER_CHECK',expected_driver='FX',expected_check_mode='SOLE'))
add('Explain Samsung excluding FX.',gold(expected_excluded_drivers='FX'))
add('Show top groups excluding Samsung.',gold('TOP_CLIENTS',expected_excluded_groups='CG0001'))
add('Show top 10 Samsung entities above 25m excluding Toyota in July',None)
# Explicit units: canonical amounts and unchanged USDm executor values.
forms=[('25m',25,25000000),('25 mn',25,25000000),('25 million',25,25000000),('25,000,000',25,25000000),('25000k',25,25000000),('25,000 thousand',25,25000000),('1.5bn',1500,1500000000),('1.5 billion',1500,1500000000),('USD 25000000',25,25000000),('$25,000,000',25,25000000)]
for form,value,absolute in forms:
 for op,opid in [('above','GT'),('below','LT'),('at least','GTE'),('at most','LTE'),('greater than or equal to','GTE'),('no more than','LTE')]:
  add(f'Show top ten groups with RWA {op} {form}',threshold(value=value,canonical=absolute,metric='BALANCE',op=opid,expected_metric='BALANCE',expected_top_n='10'),category='NUMBER_UNIT')
for form,canonical,val in [('10%',.1,10),('10 percent',.1,10),('25 bps',.0025,.25),('25 basis points',.0025,.25)]:
 add(f'Show groups by percentage increase above {form}',threshold(value=val,canonical=canonical,metric='PERCENT',unit='ratio',expected_metric='PERCENT',expected_direction='UP'),category='NUMBER_UNIT')
for bad in ['25,00,000','2,500,00m','25milion','25mm','1e3m','9007199254740992m','-25m','25 bps','25.2.3m','tenn million','25 mllion','25m1']:
 add('Show groups with RWA above '+bad,None,'NUMBER_UNIT_NEGATIVE')
for n,t in [('ten',10),('twenty five',25),('twenty-five',25),('fifty',50),('10',10)]:add('Show top '+n+' groups',gold('TOP_CLIENTS',expected_top_n=str(t)),'NUMBER_UNIT')
for n in ['0','-1','10.5','51','1000','tenn']:add('Show top '+n+' groups',None,'NUMBER_UNIT_NEGATIVE')
# Temporal syntax: canonical period gold is based on July 2026 analysis context.
times=[('July','2026-07'),('Jul','2026-07'),('August','2026-08'),('Aug','2026-08'),('July 2025','2025-07'),('2026/07','2026-07'),('Q1','2026-01..2026-03'),('Q2','2026-04..2026-06'),('Q3','2026-07..2026-09'),('Q4','2026-10..2026-12'),('last month','2026-06'),('previous month','2026-06'),('this month','2026-07'),('current month','2026-07'),('last quarter','2026-04..2026-06'),('previous quarter','2026-04..2026-06'),('current quarter','2026-07..2026-09'),('YTD','2026-01..2026-07'),('year to date','2026-01..2026-07'),('12m','2025-08..2026-07'),('12 months','2025-08..2026-07'),('last 12 months','2025-08..2026-07')]
for term,period in times:
 add('Explain Samsung RWA in '+term,gold(expected_period=period),'TEMPORAL')
for t in ['Jully','2026-13','Q5','Q12','2026-07-31','July and current quarter','last quarter current month','Q1 and Q2','July August September','July and August','last 0 months','last 999 months']:
 add('Explain Samsung RWA in '+t,None,'TEMPORAL_NEGATIVE')
# Positive typo cases. No hand-added misspellings in the synonym CSV.
for word in ['comapre','comprae','compar','compre']:
 add(f'{word} Samsung and Toyota',gold('COMPARE',expected_comparison_ids='CG0001|CG0004'),'TYPO_SEMANTIC')
for word in ['increse','incrase','increaes','increaase']:
 add(f'Why did Samsung RWA {word}?',gold(expected_direction='UP'),'TYPO_SEMANTIC')
for word in ['decrese','decrase','decreaes']:
 add(f'Why did Samsung RWA {word}?',gold(expected_direction='DOWN'),'TYPO_SEMANTIC')
for alias in ['Samsng','Samsun','Samsugn']:
 add(f'Why did {alias} RWA increase?',gold(expected_direction='UP'),'TYPO_ENTITY')
for word in ['higest','hihgest','highst']:
 add(f'Show the {word} RWA groups',gold('TOP_CLIENTS',expected_metric='BALANCE'),'TYPO_SEMANTIC')
# Adversarial fuzzy inputs: numeric/date contexts and unsupported metrics are not repaired.
for q in ['comapre','Compare S and Toyota','Explain Sam RWA','Explain XSamsungNew RWA','Show top tne groups','Show groups above 25 miloin','Explain Samsung in Agust','Explain Samsung in Jule','Show top l0 groups','Explain UNKNOWNCO RWA','predcit Samsung RWA next year','What is Samsung share price','Explain Samsung FX not July','Show groups above 25 bsp','Show groups above 1O million','Comapre Samsung or Toyota','How did Samsung cashflow increse','Show higest RWA groups unless profitable','Why did Samsng RWA increase in 2026-99']:
 add(q,None,'FUZZY_NEGATIVE')
# Unsupported/ambiguous modifiers with familiar RWA words.
for q in ['Predict Samsung RWA next year','Tell me a joke','What is Samsung stock price?','Show top 10 groups above 25m below 100m','Show groups not in July','Show groups excluding FX with more revenue','Compare Samsung Toyota Apple','Show groups by CG by percentage increase','Show all RWA increases and decreases','Show groups above 25m or below 1m','Explain Samsung unless FX increased','Compare Samsung with Toyota in June vs July']:
 add(q,None,'UNSUPPORTED')
# Clean counterpart corpus, identical gold to positive typos but using correct text.
replacements={'comapre':'compare','comprae':'compare','compar':'compare','compre':'compare','increse':'increase','incrase':'increase','increaes':'increase','increaase':'increase','decrese':'decrease','decrase':'decrease','decreaes':'decrease','Samsng':'Samsung','Samsun':'Samsung','Samsugn':'Samsung','higest':'highest','hihgest':'highest','highst':'highest'}
import re
for row in list(cases):
 if row['category'].startswith('TYPO'):
  q=re.sub(r'\b('+ '|'.join(map(re.escape,replacements))+r')\b',lambda m:replacements[m[0]],row['question'])
  add(q,{k:v for k,v in row.items() if k.startswith('expected_')},'CLEAN_FUZZY_CONTROL')
# Stateful, free-running conversations (a failure does not set ideal state).
add('Why did Samsung RWA increase in July?',gold(expected_direction='UP'),'CONTEXT',conversation='CONV_A',turn=1)
add('How about Toyota?',gold(expected_group_id='CG0004'),'CONTEXT',conversation='CONV_A',turn=2)
add('And August?',gold(expected_group_id='CG0004',expected_period='2026-08'),'CONTEXT',conversation='CONV_A',turn=3)
add('How about last month?',gold(expected_group_id='CG0004',expected_period='2026-07'),'CONTEXT',conversation='CONV_A',turn=4)
add('Did Samsung RWA increase in July?',gold('MOVEMENT_CHECK',expected_direction='UP'),'CONTEXT',conversation='CONV_B',turn=1)
add('How about Toyota?',gold('MOVEMENT_CHECK',expected_group_id='CG0004',expected_direction='UP'),'CONTEXT',conversation='CONV_B',turn=2)
add('And August?',gold('MOVEMENT_CHECK',expected_group_id='CG0004',expected_period='2026-08',expected_direction='UP'),'CONTEXT',conversation='CONV_B',turn=3)
add('Explain Samsng in July',gold(),'CONTEXT_WITH_TYPO',conversation='CONV_C',turn=1)
add('How about Toyota?',gold(expected_group_id='CG0004'),'CONTEXT',conversation='CONV_C',turn=2)
add('And Agust?',None,'FUZZY_NEGATIVE',conversation='CONV_C',turn=3)
add('And August?',gold(expected_group_id='CG0004',expected_period='2026-08'),'CONTEXT',conversation='CONV_C',turn=4)
# Exact exclusion relations, same targets in different roles.
for q,g in [('Compare Samsung and Toyota',gold('COMPARE',expected_comparison_ids='CG0001|CG0004')),('Top ten groups excluding Samsung',gold('TOP_CLIENTS',expected_top_n='10',expected_excluded_groups='CG0001')),('Top ten groups other than Samsung',gold('TOP_CLIENTS',expected_top_n='10',expected_excluded_groups='CG0001')),('Explain Samsung without FX',gold(expected_excluded_drivers='FX')),('Show groups not above 25m',threshold(op='LTE')),('Show groups excluding those below 25m',threshold(op='GTE'))]:add(q,g,'RELATION')
add('Was most of the jump concentrated in a single subsidiary?',gold('CONCENTRATION',expected_direction='UP'),'HARD_NEGATIVE')
add('Is the RWA rise continuing month after month?',gold('TREND',expected_period='2026-05..2026-07',expected_direction='UP'),'HARD_NEGATIVE')
add('Was the increase concentrated in one subsidiary?',gold('CONCENTRATION',expected_direction='UP'),'HARD_NEGATIVE')
with (R/'tests/robustness.csv').open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=HEAD);w.writeheader();w.writerows(cases)
with (R/'tests/holdout_template.csv').open('w',encoding='utf-8-sig',newline='') as f:csv.writer(f).writerow(HEAD)
print('Wrote',len(cases),'explicit developer cases')
