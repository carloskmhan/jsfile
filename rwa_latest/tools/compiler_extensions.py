"""Extra schema checks for the v5 deterministic parsers. Standard library only."""
import re
from tools.rule_schema import GRAMMARS

def validate_extensions(root, read_rows, boolean, number, normal, fail, commands, synonyms):
    grammar_action={
      'GROUP_ROOT_CAUSE':'MOVEMENT_REPORT','ENTITY_DRIVER':'MOVEMENT_REPORT','MOVEMENT_CHECK':'MOVEMENT_CHECK',
      'MAIN_DRIVER':'MAIN_DRIVER','DRIVER_CONTRIBUTION':'DRIVER_AMOUNT','DRIVER_CHECK':'DRIVER_CHECK',
      'ENTITY_CONTRIBUTION':'ENTITY_AMOUNT','TOP_CLIENTS':'RANKING','TOP_ENTITY':'RANKING',
      'COMPARE':'COMPARISON','TREND':'HISTORY','PEAK_MONTH':'HISTORY','OFFSETS':'OFFSETS',
      'DATA_QUALITY':'RECONCILIATION','CONCENTRATION':'CONCENTRATION','HISTORICAL_GROUP_PEAK':'HISTORICAL_RANKING'}
    for c in commands:
        if c.get('grammar') not in GRAMMARS or c['grammar'] != grammar_action.get(c['action']):
            fail('commands.csv',c['source']['line'],'invalid command grammar/action pair')
    fuzzy=[];seen=set()
    for line,r in read_rows(root,'fuzzy_config.csv'):
        f='fuzzy_config.csv';cat=r['category']
        if cat not in ('semantic_word','entity','short_word') or cat in seen:fail(f,line,'unknown/duplicate fuzzy category')
        seen.add(cat);r['enabled']=boolean(r['enabled'],f,line)
        for k,lo,hi in [('min_length',0,40),('max_edits',0,2),('max_corrections',0,3)]:
            v=number(r[k],f,line,k,lo,hi)
            if v!=int(v):fail(f,line,k+' must be an integer')
            r[k]=int(v)
        for k in ('threshold','min_margin'):r[k]=number(r[k],f,line,k,0,1)
        if cat=='short_word' and (r['enabled'] or r['max_edits']!=0 or r['threshold']!=1):fail(f,line,'unsafe short-token fuzzy rules are forbidden')
        if r['enabled'] and (r['min_length']<5 or r['threshold']<(.80 if cat=='semantic_word' else .83) or r['min_margin']<.05 or r['max_edits']<1 or r['max_corrections']<1):fail(f,line,'unsafe fuzzy threshold, minimum length, margin or edit policy')
        r['source']={'file':f,'line':line};fuzzy.append(r)
    if seen!={'semantic_word','entity','short_word'}:fail('fuzzy_config.csv',1,'all three fuzzy categories must be present')
    units=[];seen=set()
    standards={**dict.fromkeys(['usd'],1),**dict.fromkeys(['k','thousand','thousands'],1000),**dict.fromkeys(['m','mn','million','millions','usdm'],1000000),**dict.fromkeys(['bn','b','billion','billions'],1000000000),**dict.fromkeys(['%','percent','percentage'],.01),**dict.fromkeys(['bp','bps','basis point','basis points'],.0001)}
    for line,r in read_rows(root,'units.csv'):
        f='units.csv';r['phrase']=normal(r['phrase']);r['enabled']=boolean(r['enabled'],f,line)
        if r['phrase'] in seen or not (r['phrase']=='%' or re.fullmatch(r'[a-z]+(?: [a-z]+)*',r['phrase'])):fail(f,line,'invalid/duplicate unit')
        seen.add(r['phrase'])
        if r['kind'] not in ('absolute','ratio'):fail(f,line,'invalid unit kind')
        r['multiplier']=number(r['multiplier'],f,line,'multiplier',.000001,1000000000000)
        if r['phrase'] in standards and r['multiplier']!=standards[r['phrase']]:fail(f,line,'invalid number multiplier for standard unit '+r['phrase'])
        if (r['kind']=='ratio')!=(r['multiplier']<1):fail(f,line,'unit kind and scale disagree')
        r['source']={'file':f,'line':line};units.append(r)
    temporal=[];seen=set()
    for line,r in read_rows(root,'temporal.csv'):
        f='temporal.csv';r['phrase']=normal(r['phrase']);r['enabled']=boolean(r['enabled'],f,line)
        if r['phrase'] in seen or not re.fullmatch('[a-z]+(?: [a-z]+)*',r['phrase']):fail(f,line,'invalid/duplicate temporal expression')
        seen.add(r['phrase'])
        bounds={'MONTH':(1,12),'RELATIVE_MONTH':(-1,0),'RELATIVE_QUARTER':(-1,0),'YTD':(0,0)}
        if r['kind'] not in bounds:fail(f,line,'invalid temporal kind')
        v=number(r['value'],f,line,'value',*bounds[r['kind']])
        if int(v)!=v:fail(f,line,'temporal value must be integral')
        standard_months={'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,'may':5,'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,'sep':9,'sept':9,'september':9,'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12}
        if r['phrase'] in standard_months and (r['kind']!='MONTH' or v!=standard_months[r['phrase']]):fail(f,line,'invalid temporal month mapping')
        r['value']=int(v);r['source']={'file':f,'line':line};temporal.append(r)
    # Overlaps are recorded; an exact token sequence assigned to two concepts is an error.
    # Prefix overlaps (e.g. greater than / greater than or equal to) are valid and resolve longest-first.
    active=[s for s in synonyms if s['enabled']];token_seen={};overlaps=[]
    for s in active:
        toks=tuple(re.findall(r'[\w]+|[^\s\w]',s['phrase']))
        if toks in token_seen and token_seen[toks]['concept']!=s['concept']:fail('synonyms.csv',s['source']['line'],'conflicting tokenized phrase, previous line '+str(token_seen[toks]['source']['line']))
        token_seen[toks]=s
    for i,a in enumerate(active):
        aa=a['phrase'].split()
        for b in active[i+1:]:
            bb=b['phrase'].split()
            if aa==bb:continue
            shorter,longer=(aa,bb) if len(aa)<len(bb) else (bb,aa)
            if len(shorter)<len(longer) and any(longer[j:j+len(shorter)]==shorter for j in range(len(longer)-len(shorter)+1)):
                overlaps.append({'a':a['phrase'],'b':b['phrase'],'resolution':'leftmost-longest; names before concepts; equal-span conflicts rejected'})
    return {'fuzzyConfig':fuzzy,'units':units,'temporal':temporal,'grammarIds':sorted(GRAMMARS),'phraseOverlapAudit':overlaps}
