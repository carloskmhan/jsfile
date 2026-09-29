"""Friendly management of EXISTING CSV rules, not a second parser or model.

Two optional CSVs store card titles, examples and ownership references only.
The existing commands/synonyms/followups remain the executable source of truth.
No runtime code or compiler threshold is changed by this module.
"""
from __future__ import annotations
import copy
import csv
import io
import json
import re
import secrets
import unicodedata

CARD_HEADERS = 'capability_id,title,kind,command_id,measure,number_mode,example_number,period_mode,enabled,notes'.split(',')
EXAMPLE_HEADERS = 'capability_id,question,source_file,source_key,source_value,owned,enabled,notes'.split(',')
META_HEADERS = {'rules/capabilities.csv':CARD_HEADERS,'rules/capability_examples.csv':EXAMPLE_HEADERS}
OWNER = 'Simple manager owned; '

# Presentation recipes select only EXISTING executor concepts/patch types. The
# availability of a recipe is checked against the selected project's CSVs.
RECIPES = [
 dict(key='historical_peak_groups',title='Rank groups by historical monthly percentage peaks',command='HISTORICAL_GROUP_PEAK',concept='HISTORICAL_GROUP_REQUEST',example='Show top 10 groups by highest monthly percentage change over all history',group='Ranking',detail='historical_ranking'),
 dict(key='rank_groups',title='Rank client groups',command='TOP_CLIENTS',concept='RANK_GROUP',example='Show the top 10 groups by RWA increase',group='Ranking',detail='ranking'),
 dict(key='rank_entities',title='Rank entities within a group',command='TOP_ENTITY',concept='RANK_ENTITY',example='Show the top 10 entities by RWA increase',group='Ranking',detail='ranking'),
 dict(key='movement',title='Explain RWA movement',command='GROUP_ROOT_CAUSE',concept='ROOT',example='Why did Samsung RWA increase in July?',group='Analysis',detail='movement'),
 dict(key='main_drivers',title='Show the main contributing drivers',command='MAIN_DRIVER',concept='MAIN',example='Main driver for Samsung in July',group='Analysis',detail='simple'),
 dict(key='driver_amount',title='Show a driver contribution',command='DRIVER_CONTRIBUTION',concept='AMOUNT',example='How much came from EAD for Samsung in July?',group='Analysis',detail='simple'),
 dict(key='driver_check',title='Check whether a driver explains the movement',command='DRIVER_CHECK',concept='CHECK',example='Was EAD the main driver for Samsung in July?',group='Analysis',detail='simple'),
 dict(key='entity_amount',title='Show an entity contribution',command='ENTITY_CONTRIBUTION',concept='AMOUNT',example='How much did Samsung SDI contribute in July?',group='Analysis',detail='simple'),
 dict(key='compare_groups',title='Compare two client groups',command='COMPARE',concept='COMPARE',example='Compare Samsung and Toyota in July',group='Comparison',detail='compare'),
 dict(key='compare_periods',title='Compare two reporting periods',command='COMPARE',concept='COMPARE',example='Compare Samsung in June and July',group='Comparison',detail='compare'),
 dict(key='history',title='Show RWA history',command='TREND',concept='TREND',example='Show Samsung trend over the last 3 months',group='Analysis',detail='history'),
 dict(key='peak',title='Find the largest month or balance',command='PEAK_MONTH',concept='PEAK',example='Which month had the highest RWA for Samsung?',group='Analysis',detail='simple'),
 dict(key='offsets',title='Show offsetting drivers',command='OFFSETS',concept='OFFSETS',example='Show offsets for Samsung in July',group='Analysis',detail='simple'),
 dict(key='reconcile',title='Check the driver totals',command='DATA_QUALITY',concept='RECONCILE',example='Do the drivers reconcile for Samsung in July?',group='Checks',detail='simple'),
 dict(key='concentration',title='Check concentration across entities',command='CONCENTRATION',concept='CONCENTRATION',example='How concentrated was Samsung RWA movement in July?',group='Checks',detail='simple'),
 dict(key='direction_check',title='Check whether RWA increased or decreased',command='MOVEMENT_CHECK',concept='MOVEMENT_CHECK_REQUEST',example='Did Samsung RWA increase in July?',group='Checks',detail='movement'),
 dict(key='follow_scope',title='Do the same for another group or entity',patch='REPLACE_SCOPE',slot='scope',target='entity',example='How about Toyota?',group='Follow-up',detail='followup'),
 dict(key='follow_period',title='Do the same for another period',patch='REPLACE_PERIOD',slot='period',target='period',example='And June?',group='Follow-up',detail='followup'),
 dict(key='follow_driver',title='Switch to another driver',patch='SET_DRIVER',slot='driver',target='driver',example='What about EAD?',group='Follow-up',detail='followup'),
 dict(key='follow_filter',title='Filter the previous ranking',patch='ADD_FILTER',slot='threshold',target='filter',example='Only those above 25m',group='Follow-up',detail='followup'),
 dict(key='follow_repeat',title='Repeat the previous report',patch='REPEAT',slot='',target='intent',example='Again',group='Follow-up',detail='followup'),
]
RECIPES_BY_KEY={r['key']:r for r in RECIPES}
MEASURES={'peak_high':('PERCENT','UP','Highest monthly percentage change'),'peak_low':('PERCENT','DOWN','Lowest monthly percentage change'),'increase':('CHANGE','UP','Biggest RWA increase'),'decrease':('CHANGE','DOWN','Biggest RWA decrease'),
          'highest':('BALANCE','UP','Highest total RWA'),'lowest':('BALANCE','DOWN','Lowest total RWA'),
          'percentage':('PERCENT','UP','Biggest percentage increase'),'question':(None,None,'As stated in the question')}
ALLOWED_PERIODS={'question','context','previous','current','last3','history'}


def normal(value):
    s=unicodedata.normalize('NFKC',str(value or '')).lower().replace('’',"'").replace('‘',"'")
    s=re.sub(r"(\w)'s\b",r'\1',s)
    return re.sub(r'\s+',' ',s).strip()

def phrase_key(value):
    return normal(value).rstrip('?.!').strip()

def csv_bytes(headers,rows):
    out=io.StringIO(newline='');w=csv.DictWriter(out,fieldnames=headers,lineterminator='\n')
    w.writeheader();w.writerows(rows)
    return out.getvalue().encode('utf-8')

def on(value): return str(value).lower() in ('true','1')

class Capabilities:
    def __init__(self, wb):
        self.wb=wb

    def error(self,message,code='CAPABILITY_VALIDATION',status=422,**extra):
        # Lazy import avoids a second Workbench instance/module during script startup.
        raise self.wb.error_type(message,status,code,**extra)

    def read_meta(self,blobs=None):
        blobs=blobs if blobs is not None else self.wb.read_bytes_map()
        out={}
        for filename,headers in META_HEADERS.items():
            raw=blobs.get(filename)
            if raw is None: out[filename]=[];continue
            try:
                reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig'),newline=''),strict=True)
                if reader.fieldnames!=headers: self.error('The saved capability file needs review in Advanced.', 'CAPABILITY_SCHEMA')
                rows=list(reader)
                if len(rows)>5000: self.error('There are too many saved capability examples.')
                for r in rows:
                    if set(r)!=set(headers) or any(not isinstance(v,str) or len(v)>4000 or '\0' in v for v in r.values()):
                        self.error('A saved capability row is incomplete. Restore a backup or review it in Advanced.')
                out[filename]=rows
            except (UnicodeError,csv.Error) as e: self.error('A saved capability CSV could not be read. '+str(e))
        cards=out['rules/capabilities.csv'];examples=out['rules/capability_examples.csv']
        ids=set()
        for card in cards:
            if card['capability_id'] in ids: self.error('Two saved capabilities have the same identifier.')
            ids.add(card['capability_id'])
            if card['kind'] not in RECIPES_BY_KEY or card['measure'] not in MEASURES or card['number_mode'] not in ('question','default') or card['period_mode'] not in ALLOWED_PERIODS:
                self.error('A saved capability uses an unsupported setting.')
        if any(e['capability_id'] not in ids for e in examples): self.error('A saved example has no capability. Restore or review the CSVs in Advanced.')
        return out

    def available(self,tables):
        commands=tables['commands.csv']['rows'];followups=tables['followups.csv']['rows']
        result=[]
        for recipe in RECIPES:
            active=[r for r in commands if r['action']==recipe.get('command') and on(r['enabled'])]
            patches=[r for r in followups if r['patch_type']==recipe.get('patch') and on(r['enabled'])]
            if not active and not patches:continue
            r=dict(recipe)
            r['commandId']=active[0]['command_id'] if active else ''
            if patches:
                r['target']=patches[0]['target_slot']
                r['patchCommandId']=patches[0]['command_id']
            r['defaultNumber']=next((int(x['value']) for x in tables['settings.csv']['rows'] if x['key']=='default_top_n'),5)
            result.append(r)
        return result

    def list(self):
        snap=self.wb.read_snapshot();tables=snap['tables'];meta=self.read_meta()
        recipes=self.available(tables);stored={r['capability_id']:r for r in meta['rules/capabilities.csv']}
        # Include every enabled command row, even if a developer added another
        # reviewed command using an existing action. Do not hide custom source rows.
        command_recipes=[]
        for command in tables['commands.csv']['rows']:
            if not on(command['enabled']): continue
            recipe=next((r for r in recipes if r.get('command')==command['action']),None)
            if recipe: command_recipes.append({**recipe,'commandId':command['command_id']})
        recipes=command_recipes+[r for r in recipes if r.get('patch')]
        examples=meta['rules/capability_examples.csv'];cards=[];seen_commands=set()
        for r in recipes:
            # One built-in card per actual command or follow-up operation. Comparison
            # modes share one executor; both remain available in the wizard.
            key='builtin:'+ (r['commandId'] or r['patch'])
            if key in seen_commands: continue
            seen_commands.add(key)
            override=stored.get(key)
            if override and not on(override['enabled']):continue
            card=override or {'capability_id':key,'title':r['title'],'kind':r['key'],'command_id':r['commandId'],
                   'measure':'increase' if r['detail'] in ('ranking','movement') else 'question','number_mode':'question',
                   'example_number':'10','period_mode':'question','enabled':'true','notes':''}
            ee=[e for e in examples if e['capability_id']==key and on(e['enabled'])]
            cards.append(self.public_card(card,ee or [{'question':r['example'],'source_file':'','source_key':'','source_value':'','owned':'false'}],True,tables))
        for key,card in stored.items():
            if key.startswith('builtin:') or not on(card['enabled']):continue
            ee=[e for e in examples if e['capability_id']==key and on(e['enabled'])]
            cards.append(self.public_card(card,ee,False,tables))
        return {'ok':True,'revision':snap['revision'],'cards':cards,'recipes':self.available(tables),
                'artifactConsistent':snap['artifactConsistent'],'artifactHash':snap['artifactHash'],
                'defaultNumber':recipes[0]['defaultNumber'] if recipes else 5,
                'maxNumber':next((int(x['value']) for x in tables['settings.csv']['rows'] if x['key']=='max_top_n'),50)}

    def public_card(self,card,examples,builtin,tables):
        r=RECIPES_BY_KEY[card['kind']]
        available=any(x['key']==r['key'] for x in self.available(tables))
        if card['command_id']:
            available=available and any(x['command_id']==card['command_id'] and on(x['enabled']) for x in tables['commands.csv']['rows'])
        for example in examples:
            source=example.get('source_file','')
            if not source:continue
            if source not in ('synonyms.csv','followups.csv'):available=False;continue
            keyfield,valuefield=('phrase','concept') if source=='synonyms.csv' else ('pattern','patch_type')
            available=available and any(normal(x[keyfield])==example.get('source_key') and x[valuefield]==example.get('source_value') and on(x['enabled']) for x in tables[source]['rows'])
        return {'id':card['capability_id'],'title':card['title'],'kind':card['kind'],'group':r['group'],
                'measure':card['measure'],'numberMode':card['number_mode'],'exampleNumber':int(card['example_number'] or 10),
                'periodMode':card['period_mode'],'examples':[e['question'] for e in examples],
                'bindings':[{k:e.get(k,'') for k in ('question','source_file','source_key','source_value','owned')} for e in examples],
                'builtin':builtin,'needsReview':not available}

    def validate_text(self,s,label,max_len=1000):
        if not isinstance(s,str) or not s.strip() or len(s)>max_len or re.search(r'[<>`\x00-\x1f\x7f]',s):
            self.error(label+' must be plain text, without code or line breaks.')
        if s.lstrip().startswith(('=','+','@','-')): self.error(label+' cannot contain a spreadsheet formula or command prefix.')
        return s.strip()

    def protected_check(self,phrase,concept,tables):
        if not re.fullmatch(r"[a-z][a-z '-]{1,159}",phrase) or len(phrase.split())>12:
            self.error('Use a short phrase made of words. Keep names, numbers, dates and conditions outside the new phrase.','UNSAFE_EXPRESSION')
        # Recognised meaning is never hidden inside a newly mapped whole sentence.
        # Other compatible request features are still protected to avoid shadowing
        # a pre-existing exact expression without an explicit ownership review.
        for row in tables['synonyms.csv']['rows']:
            if not on(row['enabled']):continue
            s=normal(row['phrase'])
            if re.search(r'(?<!\w)'+re.escape(s)+r'(?!\w)',phrase) and row['concept']!=concept and row['concept']!='COURTESY':
                self.error('This wording already contains a different meaning. Keep its existing meaning and use a more specific new phrase.','EXPRESSION_CONFLICT')
        protected=set('not no never excluding exclude except without only above below greater less least most at than percent percentage bps plus minus zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion forecast predict projected tomorrow yesterday next previous last current this july june august january february march april may september october november december quarter ytd'.split())
        if any(t in protected for t in phrase.split()):
            self.error('Dates, amounts, exclusions and direction words cannot be swallowed by a new expression. Keep them explicit.','UNSAFE_EXPRESSION')
        for filename in ['units.csv','temporal.csv']:
            for row in tables[filename]['rows']:
                if on(row.get('enabled','true')) and re.search(r'(?<!\w)'+re.escape(normal(row['phrase']))+r'(?!\w)',phrase):
                    self.error('A number, unit or period expression must keep its existing meaning.','UNSAFE_EXPRESSION')

    def owned_row(self,row):
        return row.get('notes','').startswith(OWNER) and row.get('enabled')=='true' and (row.get('weight','1')=='1')

    def cleanup(self,tables,examples):
        refs={(e['source_file'],e['source_key']) for e in examples if on(e['enabled']) and e['source_file']}
        removed=[]
        for filename,keyfield in [('synonyms.csv','phrase'),('followups.csv','pattern')]:
            kept=[]
            for row in tables[filename]['rows']:
                key=normal(row[keyfield])
                if self.owned_row(row) and (filename,key) not in refs:
                    # Preserve a managed phrase mentioned by an unowned synonym or
                    # follow-up. Retention is intentionally conservative.
                    shared=any(not self.owned_row(r) and re.search(r'(?<!\w)'+re.escape(key)+r'(?!\w)',normal(r['pattern']))
                               for r in tables['followups.csv']['rows'])
                    if filename=='synonyms.csv' and any(on(e['enabled']) and re.search(r'(?<!\w)'+re.escape(key)+r'(?!\w)',normal(e['question'])) for e in examples): shared=True
                    if not shared:removed.append({'file':filename,'key':key});continue
                kept.append(row)
            tables[filename]['rows']=kept
        return removed

    def prepare(self,payload):
        with self.wb.lock:
            snap=self.wb.read_snapshot()
            if payload.get('revision')!=snap['revision']:self.error('Someone changed the rules. Reload the home page before saving.','REVISION_CONFLICT',409)
            tables=copy.deepcopy(snap['tables']);meta=self.read_meta();all_cards=meta['rules/capabilities.csv'];all_examples=meta['rules/capability_examples.csv']
            mode=payload.get('operation','save');key=payload.get('id')
            visible={c['id']:c for c in self.list()['cards']}
            if key and key not in visible:self.error('This capability is no longer available. Reload the home page.','NOT_FOUND',404)
            current=visible.get(key)
            old_examples=[e for e in all_examples if e['capability_id']==key]
            others=[e for e in all_examples if e['capability_id']!=key]
            base_cards=[r for r in all_cards if r['capability_id']!=key]
            removed=[];notice=[];new_examples=[];deleted_action=None
            if mode=='delete':
                if not current:self.error('Choose a capability to delete.')
                recipe=RECIPES_BY_KEY[current['kind']]
                if current['builtin']:
                    old=next((r for r in all_cards if r['capability_id']==key),None)
                    tombstone=old or {'capability_id':key,'title':current['title'],'kind':current['kind'],'command_id':key.split(':',1)[1] if recipe.get('command') else '', 'measure':current['measure'],'number_mode':current['numberMode'],'example_number':str(current['exampleNumber']),'period_mode':current['periodMode'],'enabled':'true','notes':''}
                    tombstone={**tombstone,'enabled':'false'};base_cards.append(tombstone)
                    shared=[r for r in base_cards if on(r['enabled']) and (r['command_id']==tombstone['command_id'] if recipe.get('command') else r['kind']==recipe['key'])]
                    if shared:notice.append('The shared report stays available to your other capabilities. Only this card and its own added wording are removed.')
                    elif recipe.get('command'):
                        for row in tables['commands.csv']['rows']:
                            if row['command_id']==tombstone['command_id']:row['enabled']='false';deleted_action=row['action']
                        # The existing compiler checks even disabled references. Remove
                        # only rows directly and exclusively referencing this command;
                        # the transaction backup retains their exact original contents.
                        tables['followups.csv']['rows']=[row for row in tables['followups.csv']['rows'] if row['command_id']!=tombstone['command_id']]
                        notice.append('This report is disabled. Shared words and customer identities are preserved.')
                    else:
                        for row in tables['followups.csv']['rows']:
                            if row['patch_type']==recipe['patch']:row['enabled']='false'
                        notice.append('This follow-up operation is disabled. Other follow-ups stay unchanged.')
                removed=self.cleanup(tables,others)
                title=current['title'];kind=current['kind'];card=None
            elif mode=='save':
                kind=payload.get('kind');recipe=next((r for r in self.available(tables) if r['key']==kind),None)
                if not recipe:self.error('Choose a report that this engine already supports. New calculations require developer work.')
                key=key or 'CAP_'+secrets.token_hex(8).upper()
                if current and current['builtin'] and RECIPES_BY_KEY[current['kind']].get('command')!=recipe.get('command'):
                    self.error('To add a different report type, use Add new capability. This edit keeps the existing shared report.','EXPRESSION_CONFLICT')
                if current and current['builtin'] and recipe.get('command'):
                    recipe={**recipe,'commandId':key.split(':',1)[1]}
                title=self.validate_text(payload.get('title') or recipe['title'],'Capability name',140)
                measure=payload.get('measure','question');number_mode=payload.get('numberMode','question');period=payload.get('periodMode','question')
                if measure not in MEASURES or number_mode not in ('question','default') or period not in ALLOWED_PERIODS:self.error('Choose one of the supported report details.')
                n=payload.get('exampleNumber',10)
                maxn=next((int(r['value']) for r in tables['settings.csv']['rows'] if r['key']=='max_top_n'),50)
                if type(n) is not int or not 1<=n<=maxn:self.error('The example number must be from 1 to '+str(maxn)+'.')
                incoming=payload.get('examples')
                if not isinstance(incoming,list) or not 1<=len(incoming)<=20:self.error('Add between 1 and 20 example questions.')
                if any(not isinstance(e,dict) for e in incoming):self.error('Each example must be a question record.')
                if len({phrase_key(e.get('question','')) for e in incoming})!=len(incoming):self.error('The same example is listed twice. Keep it once.')
                card={'capability_id':key,'title':title,'kind':kind,'command_id':recipe.get('commandId',''), 'measure':measure,'number_mode':number_mode,'example_number':str(n),'period_mode':period,'enabled':'true','notes':'Display settings and reviewed examples; execution semantics remain in the existing language CSVs.'}
                base_cards.append(card)
                for e in incoming:
                    if not isinstance(e,dict):self.error('Invalid example.')
                    question=self.validate_text(e.get('question'),'Example question')
                    phrase=phrase_key(e.get('phrase',''));pattern=phrase_key(e.get('pattern',''))
                    source_file=source_key=source_value='';owned=False
                    if recipe.get('patch'):
                        if not pattern:self.error('A follow-up needs a recognised group, period or driver example. Try the suggested example.','UNRESOLVED_EXAMPLE')
                        slots=re.findall(r'\{([^{}]+)\}',pattern)
                        if sorted(slots)!=([recipe['slot']] if recipe['slot'] else []):self.error('This follow-up would lose or invent a parameter. Use a simpler example.','UNSAFE_EXPRESSION')
                        # Literal part cannot hide a recognised exclusion, forecast or another operation.
                        literal=re.sub(r'\{[^}]+\}','',pattern).strip()
                        for r in tables['synonyms.csv']['rows']:
                            if on(r['enabled']) and (r['concept'].startswith('UNSUPPORTED_') or r['concept'] in {'NEGATE','EXCLUDE','INCLUDE','COMPARE','RANK','GT','GTE','LT','LTE'}) and re.search(r'(?<!\w)'+re.escape(normal(r['phrase']))+r'(?!\w)',literal):
                                self.error('This follow-up contains a condition that cannot be discarded. Try the existing exclusion or comparison request instead.','UNSAFE_EXPRESSION')
                        row=next((r for r in tables['followups.csv']['rows'] if normal(r['pattern'])==pattern),None)
                        if row and (row['patch_type']!=recipe['patch'] or not on(row['enabled'])):self.error('This expression could mean two different things. Use a more specific follow-up.','EXPRESSION_CONFLICT')
                        if row is None:
                            row={'rule_id':'UI_'+secrets.token_hex(8).upper(),'pattern':pattern,'patch_type':recipe['patch'],'target_slot':recipe['target'],'command_id':recipe.get('patchCommandId',''),'enabled':'true','notes':OWNER+key}
                            tables['followups.csv']['rows'].append(row)
                        source_file,source_key,source_value='followups.csv',pattern,recipe['patch'];owned=self.owned_row(row)
                    elif phrase:
                        # A proposed mapping must really occur as literal wording in the example.
                        if not re.search(r'(?<!\w)'+re.escape(phrase)+r'(?!\w)',normal(question)):
                            self.error('The new wording does not occur in this example. Test the question again.','UNSAFE_EXPRESSION')
                        concept=recipe['concept'];row=next((r for r in tables['synonyms.csv']['rows'] if normal(r['phrase'])==phrase),None)
                        if row and (row['concept']!=concept or not on(row['enabled'])):
                            old_owned=any(x['source_file']=='synonyms.csv' and x['source_key']==phrase and on(x['owned']) for x in old_examples)
                            shared=any(x['source_file']=='synonyms.csv' and x['source_key']==phrase for x in others)
                            if not(old_owned and self.owned_row(row) and not shared):
                                self.error('This expression could mean two different things. It is already used elsewhere. Keep the shared expression and choose different wording.','EXPRESSION_CONFLICT')
                            # Validate against other expressions, never against the row being updated.
                            reduced=copy.deepcopy(tables);reduced['synonyms.csv']['rows']=[x for x in reduced['synonyms.csv']['rows'] if normal(x['phrase'])!=phrase]
                            self.protected_check(phrase,concept,reduced);row['concept']=concept
                        elif row is None:
                            self.protected_check(phrase,concept,tables)
                            row={'concept':concept,'phrase':phrase,'weight':'1','enabled':'true','notes':OWNER+key};tables['synonyms.csv']['rows'].append(row)
                        source_file,source_key,source_value='synonyms.csv',phrase,concept;owned=self.owned_row(row)
                    # Existing fully-understood examples can still depend on a managed phrase.
                    else:
                        old=next((x for x in old_examples if phrase_key(x['question'])==phrase_key(question)),None)
                        if old:
                            source_file,source_key,source_value=old['source_file'],old['source_key'],old['source_value'];owned=on(old['owned'])
                        else:
                            for row in tables['synonyms.csv']['rows']:
                                if self.owned_row(row) and re.search(r'(?<!\w)'+re.escape(normal(row['phrase']))+r'(?!\w)',normal(question)):
                                    source_file,source_key,source_value='synonyms.csv',normal(row['phrase']),row['concept'];owned=True;break
                    new_examples.append({'capability_id':key,'question':question,'source_file':source_file,'source_key':source_key,'source_value':source_value,'owned':str(owned).lower(),'enabled':'true','notes':''})
                # Cleanup is only applied after all references (including shared new ones) exist.
                removed=self.cleanup(tables,others+new_examples)
            else:self.error('Unknown capability operation.')
            # Existing compiler is the mandatory gate, with its existing thresholds intact.
            compiled=self.wb.validate({'revision':snap['revision'],'tables':tables})
            draft=self.wb.get_draft(compiled['draftId'])
            cards_bytes=csv_bytes(CARD_HEADERS,base_cards);examples_bytes=csv_bytes(EXAMPLE_HEADERS,others+new_examples)
            draft['blobs']['rules/capabilities.csv']=cards_bytes
            draft['blobs']['rules/capability_examples.csv']=examples_bytes
            self.read_meta(draft['blobs'])
            draft['simple']={'id':key,'title':title,'operation':mode,'kind':kind,'deletedAction':deleted_action}
            draft['changes'] += [{'file':'capabilities.csv','beforeRows':len(all_cards),'afterRows':len(base_cards)}, {'file':'capability_examples.csv','beforeRows':len(all_examples),'afterRows':len(others+new_examples)}]
            # This token binds the browser's real-engine preflight to this exact draft.
            draft['checkToken']=secrets.token_urlsafe(24)
            return {**compiled,'id':key,'title':title,'kind':kind,'operation':mode,'checkToken':draft['checkToken'],
                    'notices':notice,'removedOwnedRows':len(removed),'newExpressions':[{'question':e['question'],'phrase':e['source_key'],'source':e['source_file']} for e in new_examples],
                    'card':self.public_card(card,new_examples,key.startswith('builtin:'),tables) if card else None,
                    'deletedAction':deleted_action,'deletedExamples':current['examples'] if mode=='delete' and deleted_action else [],'remainingCards':[self.public_card(c,[e for e in others if e['capability_id']==c['capability_id']],c['capability_id'].startswith('builtin:'),tables) for c in base_cards if on(c['enabled'])],
                    'message':'Draft compiled. Source files are unchanged until the real-engine checks pass and you save.'}

    def commit(self,payload):
        with self.wb.lock:
            draft=self.wb.get_draft(payload.get('draftId'))
            if not draft.get('simple'):self.error('Prepare a capability change first.')
            if payload.get('checkToken')!=draft.get('checkToken') or payload.get('artifactHash')!=draft['hash'] or payload.get('checksPassed') is not True:
                self.error('Run the interpretation checks for this exact draft before saving.','CHECKS_REQUIRED')
            # This browser check is review evidence, NOT an authentication/security boundary.
            draft['capabilityChecksConfirmed']=True
            return self.wb.commit({**payload,'note':draft['simple']['operation'].title()+': '+draft['simple']['title']})
