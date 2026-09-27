"""Create development regression questions with explicit gold plans. NOT a blind validation set.
Add independent questions by editing questions.csv or passing another CSV to tools/evaluate.mjs.
"""
from pathlib import Path
import csv
P=Path(__file__).resolve().parent
HEADERS='id,split,conversation_id,turn,question,context_group,context_entity,context_month,expected_status,expected_action,expected_group_id,expected_entity_id,expected_period,expected_metric,expected_direction,expected_top_n,expected_driver,expected_excluded_groups,expected_excluded_drivers,expected_comparison_ids,expected_threshold_op,expected_threshold_value,expected_threshold_metric,notes'.split(',')
rows=[]
def add(q,action='',group='',month='',status='ACCEPT',conv='',turn=1,ctx='SAMSUNG GROUP',**kw):
 row=dict(id=f'Q{len(rows)+1:04}',split='regression',conversation_id=conv or f'S{len(rows)+1:04}',turn=turn,question=q,context_group=ctx,context_entity='',context_month='2026-06',expected_status=status,expected_action=action,expected_group_id=group,expected_period=month,notes='Developer-authored; not independent user accuracy.')
 row.update(kw);rows.append(row)
roots=[
 ('Why did {g} RWA increase in {m}?','UP'),('What drove {g} RWA higher in {m}?','UP'),
 ('Reason for {g} RWA rise in {m}?','UP'),('{g} RWA went up in {m}. Why?','UP'),
 ('What caused the increase in {g} RWA in {m}?','UP'),('Walk me through {g} RWA movement in {m}.','AUTO'),
 ('Explain {g} RWA in {m}.','AUTO'),('What led to {g} RWA uptick in {m}?','UP'),
 ('Could you explain {g} RWA increase in {m}?','UP'),('Why did {g} RWA decline in {m}?','DOWN'),
 ('What drove {g} RWA lower in {m}?','DOWN'),('What happened to {g} RWA in {m}?','AUTO'),
 ('Talk me through {g} RWA in {m}.','AUTO'),('Give me a breakdown of {g} RWA in {m}.','AUTO'),
 ('What explains {g} RWA surge in {m}?','UP'),('Summarize {g} RWA in {m}.','AUTO'),
 ('Why did {g} RWA fall in {m}?','DOWN'),('Why did {g} RWA grow in {m}?','UP')]
groups=[('Samsung','CG0001'),('Hyundai','CG0002'),('Apple','CG0003'),('Toyota','CG0004')]
months=[('June 2026','2026-06'),('July 2026','2026-07'),('Jun-26','2026-06'),('2026-07','2026-07')]
for template,direction in roots:
 for g,gid in groups:
  for month,key in months:add(template.format(g=g,m=month),'GROUP_ROOT_CAUSE',gid,key,expected_direction=direction,expected_metric='CHANGE')
for dimension,action in [('entities','TOP_ENTITY'),('subsidiaries','TOP_ENTITY'),('groups','TOP_CLIENTS')]:
 for n in [3,5,10]:
  for month,key in months:
   for metric,extra in [('CHANGE',''),('PERCENT',' by percentage increase')]:
    q=f'Show top {n} {dimension}{extra} in {month}'
    if action=='TOP_ENTITY':q+=' for Samsung'
    add(q,action,'CG0001' if action=='TOP_ENTITY' else '~',key,expected_top_n=n,expected_metric=metric)
for g,gid in groups:
 for month,key in months:
  for driver in ['CG','EAD','FX']:
   add(f'How much came from {driver} for {g} in {month}?','DRIVER_CONTRIBUTION',gid,key,expected_driver=driver)
   add(f'Was {driver} the main driver for {g} in {month}?','DRIVER_CHECK',gid,key,expected_driver=driver)
for a,aid in groups:
 for b,bid in groups:
  if a==b:continue
  for month,key in months:add(f'Compare {a} and {b} RWA in {month}','COMPARE',aid,key,expected_comparison_ids=aid+'|'+bid)
for month,key in months:
 for op,code,value in [('above','GT',25),('at least','GTE',100),('below','LT',500),('at most','LTE',1000)]:
  add(f'Top 10 groups excluding Samsung in {month} {op} {value}m','TOP_CLIENTS','~',key,expected_excluded_groups='CG0001',expected_threshold_op=code,expected_threshold_value=value,expected_threshold_metric='CHANGE')
for q,action in [('What are the offsets for Samsung in June 2026?','OFFSETS'),('Does Samsung reconcile in June 2026?','DATA_QUALITY'),('Show Samsung trend over last 3 months in June 2026','TREND'),('When did Samsung RWA peak?','PEAK_MONTH'),('Was Samsung concentrated in June 2026?','CONCENTRATION')]:
 add(q,action,'CG0001', '2026-04..2026-06' if action=='TREND' else 'history:2026-06' if action=='PEAK_MONTH' else '2026-06')
negatives=['Predict {g} RWA next year.','Tell me a joke about {g}.','What is {g} stock price?','Forecast {g} RWA next month.','Should we sell {g}?','Explain {g} revenue.','Calculate {g} risk density.','Why did {g} RWA increase adjusted for inflation?','Top entities for {g} unless FX is zero.','Explain {g} RWA in June not July.','Show {g} increase and decrease.','Explain {g} excluding unicorns.','What if {g} exposure fell by 20 percent?','Execute code for {g}.','Compare {g} with unknown holdings.']
for q in negatives:
 for g,gid in groups:add(q.format(g=g),status='REJECT')
for q in ['Why Samsung RWA and compare Toyota?','Explain Samsung in June and July','Top groups with magical weighting','Show Samsung risk density','Compare Samsung and Toyota in June and July','Explain Samsung without FX on a constant currency balance basis','Which is better Samsung or Toyota?','Top groups above 25','Explain Samsung excluding','Not Samsung in July','Explain Samsung but not in July']:
 add(q,status='REJECT')
# Sequences are evaluated free-running: no gold command is injected into state.
chains=[
 [('Why did Samsung RWA increase in July?','GROUP_ROOT_CAUSE','CG0001','2026-07',{}),('How about Toyota?','GROUP_ROOT_CAUSE','CG0004','2026-07',{}),('And August?','GROUP_ROOT_CAUSE','CG0004','2026-08',{})],
 [('Top 10 groups in June 2026','TOP_CLIENTS','~','2026-06',{'expected_top_n':10}),('Only those above 25m','TOP_CLIENTS','~','2026-06',{'expected_threshold_op':'GT','expected_threshold_value':25}),('Compare the first one with Toyota','COMPARE','CG0001','2026-06',{'expected_comparison_ids':'CG0001|CG0004'})],
 [('Explain Samsung in June 2026','GROUP_ROOT_CAUSE','CG0001','2026-06',{}),('Exclude FX','GROUP_ROOT_CAUSE','CG0001','2026-06',{'expected_excluded_drivers':'FX'}),('How about Toyota?','GROUP_ROOT_CAUSE','CG0004','2026-06',{'expected_excluded_drivers':'FX'}),('Include FX back','GROUP_ROOT_CAUSE','CG0004','2026-06',{'expected_excluded_drivers':'~'})],
 [('Top 3 entities for Samsung in June 2026','TOP_ENTITY','CG0001','2026-06',{'expected_top_n':3}),('Why?','ENTITY_DRIVER','CG0001','2026-06',{'expected_entity_id':'CG0001-E001'}),('What about the next one?','ENTITY_DRIVER','CG0001','2026-06',{'expected_entity_id':'CG0001-E002'}),('Same for May','ENTITY_DRIVER','CG0001','2026-05',{'expected_entity_id':'CG0001-E002'}),('At group level','GROUP_ROOT_CAUSE','CG0001','2026-05',{'expected_entity_id':'~'})],
 [('Top 3 entities for Samsung in June 2026','TOP_ENTITY','CG0001','2026-06',{}),('Rank those by CG','TOP_ENTITY','CG0001','2026-06',{'expected_driver':'CG'}),('Which of those had the largest percentage increase?','TOP_ENTITY','CG0001','2026-06',{'expected_metric':'PERCENT','expected_driver':'~'})],
]
for j,chain in enumerate(chains):
 for i,(q,act,g,m,extra) in enumerate(chain):add(q,act,g,m,conv=f'C{j+1:03}',turn=i+1,**extra)
# Explicit ambiguity gold labels (not silently counted as generic rejections).
for q in ['Explain Samsung in June and July','Explain Samsung increase and decrease',
 'Explain Samsung in June not July','Not Samsung in July','Explain Samsung but not in July',
 'Compare Samsung and Toyota and Hyundai','Why Samsung RWA and compare Toyota?']:
 add(q,status='REJECT' if q in ['Not Samsung in July','Explain Samsung but not in July','Compare Samsung and Toyota and Hyundai'] else 'AMBIGUOUS')
for q in ['Explain Samsung by product in June','Explain Samsung by booking location',
          'Explain Samsung CG in June','Show Samsung FX trend','Main driver Samsung CG']:
 add(q,status='REJECT')
with (P/'questions.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=HEADERS);w.writeheader();w.writerows({k:r.get(k,'') for k in HEADERS} for r in rows)
with (P/'holdout_template.csv').open('w',encoding='utf-8-sig',newline='') as f:csv.writer(f).writerow(HEADERS)
print('Wrote',len(rows),'development cases; no learned training corpus.')
