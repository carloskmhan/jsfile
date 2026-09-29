#!/usr/bin/env python3
"""Enable the reviewed historical-percent report in EXISTING CSVs, with backups.
Run in the full updated project: python install_historical_peak.py
No network, no training, no overwrite of user rule tables from a sample file.
Uses the existing Workbench compiler/transaction journal/rollback and OS lock.
"""
from pathlib import Path
import argparse,copy,json,sys
from rule_manager import Workbench

COMMAND_ID='HISTORICAL_PEAK_GROUPS'
ACTION='HISTORICAL_GROUP_PEAK'
PHRASES={
 'HISTORICAL_HIGH':[
  'highest monthly percentage change','highest monthly percentage increase',
  'maximum monthly percentage change','peak monthly percentage change',
  'peak monthly percentage increase','highest month on month percentage change',
  'highest month-on-month percentage change','highest mom percentage change',
  'peak rwa increase'],
 'HISTORICAL_LOW':[
  'lowest monthly percentage change','lowest monthly percentage increase',
  'minimum monthly percentage change','lowest month on month percentage change',
  'lowest month-on-month percentage change','lowest mom percentage change',
  'trough monthly percentage change'],
 'HISTORY_SCOPE':['all history','all available history','entire history','full history','whole history','the entire period','over all history','over all available history','across all history','over the entire period','over full history','over entire history','across the entire period'],
 'PERCENT':['monthly percentage change','monthly percentage increase','mom percentage change','month on month percentage change'],
}

def upgrade(root):
 wb=Workbench(root)
 try:
  snap=wb.read_snapshot();tables=copy.deepcopy(snap['tables']);commands=tables['commands.csv']['rows']
  existing=[r for r in commands if r['command_id']==COMMAND_ID or r['action']==ACTION]
  if existing:
   if len(existing)!=1 or existing[0]['command_id']!=COMMAND_ID or existing[0]['action']!=ACTION or existing[0]['grammar']!='HISTORICAL_RANKING':
    raise ValueError('A different historical peak definition already exists. Review it instead of overwriting it.')
  else:
   template=next((r for r in commands if r['action']=='TOP_CLIENTS'),None)
   if template is None:raise ValueError('The existing group-ranking command is required.')
   row=copy.deepcopy(template)
   row.update(command_id=COMMAND_ID,intent='HISTORICAL_PERCENT_RANKING',action=ACTION,response_template=ACTION,
     grammar='HISTORICAL_RANKING',scope='PORTFOLIO',primary_features='HISTORICAL_GROUP_REQUEST',supporting_features='',
     contradiction_features='COMPARE_REQUEST|RANK_ENTITY|RWA_DRIVER|MAIN_DRIVER_REQUEST|TREND_REQUEST|MOVEMENT_CHECK_REQUEST|BALANCE|ABSOLUTE',
     required_slots='metric|topN',optional_slots='period|direction|exclusions|candidateSet|concise',forbidden_slots='forecast',
     enabled='true',notes='Monthly percentage extrema per group; show selected month and monthly amount. Separate reviewed executor, not cumulative RWA.')
   commands.append(row)
  # Do not let the new complete phrase get classified as an old report.
  for r in commands:
   if r['action']!=ACTION:
    parts=[s for s in r['contradiction_features'].split('|') if s]
    if 'HISTORICAL_GROUP_REQUEST' not in parts:parts.append('HISTORICAL_GROUP_REQUEST')
    r['contradiction_features']='|'.join(parts)
  synonyms=tables['synonyms.csv']['rows'];by_phrase={r['phrase'].strip().lower():r for r in synonyms}
  for concept,phrases in PHRASES.items():
   for phrase in phrases:
    old=by_phrase.get(phrase)
    if old:
     if old['concept']!=concept:raise ValueError('Expression conflict for '+repr(phrase)+'; existing meaning is '+old['concept']+'. Nothing was saved.')
     # User-disabled expressions stay disabled. Do not silently reactivate them.
     continue
    r=dict.fromkeys(tables['synonyms.csv']['headers'],'')
    r.update(concept=concept,phrase=phrase,weight='1',enabled='true',notes='Reviewed historical percentage report vocabulary.')
    synonyms.append(r);by_phrase[phrase]=r
  draft=wb.validate({'revision':snap['revision'],'tables':tables})
  result=wb.commit({'revision':snap['revision'],'draftId':draft['draftId'],'note':'Enable reviewed historical monthly percentage ranking'})
  if not result['artifactConsistent']:raise RuntimeError('Generated-rule fingerprints are inconsistent after installation.')
  print('Historical percentage report enabled. Existing rules preserved; compiler validation passed.')
  print('Backup:',result.get('backupId','(see .rule_manager/backups)'))
  print('Deploy the updated runtime files AND this project\'s command_patterns.txt together.')
  return result
 finally:wb.close()

if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--project',type=Path,default=Path(__file__).resolve().parent);args=ap.parse_args()
 try:upgrade(args.project)
 except Exception as e:print('Installation failed:',str(e),file=sys.stderr);sys.exit(1)
