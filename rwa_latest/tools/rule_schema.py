"""Reviewed, finite engine vocabulary. Adding an executor/slot requires a code review, not training."""
ENGINE_VERSION = '6.0.0-review'
ACTIONS = {
 'GROUP_ROOT_CAUSE','ENTITY_DRIVER','MAIN_DRIVER','DRIVER_CONTRIBUTION',
 'DRIVER_CHECK','ENTITY_CONTRIBUTION','TOP_ENTITY','TOP_CLIENTS','COMPARE',
 'CONCENTRATION','DATA_QUALITY','OFFSETS','TREND','PEAK_MONTH'
}
CONCEPTS = set('''ROOT DRIVER MAIN AMOUNT CHECK SOLE RANK COMPARE TREND PEAK OFFSETS RECONCILE CONCENTRATION
RWA INCREASE DECREASE BALANCE PERCENT ABSOLUTE ENTITY GROUP PRODUCT LOCATION
EXCLUDE INCLUDE CLEAR_EXCLUSIONS NEGATE ONLY MORE LESS GT GTE LT LTE BRIEF DETAIL
REFERENCE FIRST SECOND THIRD FOURTH FIFTH NEXT THOSE BOTH SAME FOLLOWUP
UNSUPPORTED_FORECAST UNSUPPORTED_METRIC UNSUPPORTED_ACTION UNSUPPORTED_CAUSE UNSUPPORTED_LOGIC
DRIVER_CG DRIVER_EAD DRIVER_PD DRIVER_LGD DRIVER_FX DRIVER_MATURITY DRIVER_CRM DRIVER_BASEL
DRIVER_NEW_BUSINESS DRIVER_NOVATION DRIVER_AMENDMENT DRIVER_TRANSFER DRIVER_OTHER
HELP COURTESY TECHNICAL REPORTED TOTAL
RWA_DRIVER MAIN_DRIVER_REQUEST DRIVER_AMOUNT DRIVER_CHECK_REQUEST ENTITY_AMOUNT
RANK_ENTITY RANK_GROUP COMPARE_REQUEST TREND_REQUEST PEAK_REQUEST OFFSETS_REQUEST
RECONCILE_REQUEST CONCENTRATION_REQUEST TWO_SUBJECTS PERIOD_COMPARISON HAS_ENTITY HAS_PERIOD HAS_MODIFIER
'''.split())
SLOTS = set('''intent metric entity entities period direction scope ranking topN comparison driver filter modifier aggregation
subject forecast threshold exclusions rankReference candidateSet concise query periodComparison
'''.split())
TEMPLATE_SLOTS = {'scope','other_scope','period','driver','threshold','rankref','n','metric'}
PATCHES = {'REPLACE_SCOPE','REPLACE_PERIOD','SET_DRIVER','EXCLUDE','INCLUDE','CLEAR_EXCLUSIONS',
 'ADD_FILTER','COMPARE_SCOPE','COMPARE_REFERENCE','COMPARE_PREVIOUS_PERIOD','COMPARE_TWO',
 'FOCUS_REFERENCE','NEXT_REFERENCE','TOP_REFERENCE','RERANK_SET','SET_METRIC','SET_LIMIT',
 'SET_STYLE','GROUP_LEVEL','CHANGE_COMMAND','REPEAT'}
HEADERS = {
 'commands.csv': 'command_id,intent,action,response_template,scope,primary_features,supporting_features,contradiction_features,required_slots,optional_slots,forbidden_slots,intent_weight,metric_weight,scope_weight,subject_weight,period_weight,modifier_weight,contradiction_weight,min_confidence,min_margin,enabled,notes'.split(','),
 'synonyms.csv': 'concept,phrase,weight,enabled,notes'.split(','),
 'aliases.csv': 'kind,canonical_id,canonical_name,parent_id,alias,enabled,notes'.split(','),
 'followups.csv': 'rule_id,pattern,patch_type,target_slot,command_id,enabled,notes'.split(','),
 'settings.csv': 'key,value,notes'.split(',')
}
SETTINGS = {
 'top_k': (int,3,3,10), 'max_query_chars': (int,1000,100,4000),
 'max_top_n': (int,50,1,100), 'default_top_n': (int,5,1,50),
 'default_window_months': (int,3,1,120), 'max_window_months': (int,120,1,240),
 'unknown_token_limit': (int,0,0,0), 'default_margin': (float,0.08,0,1),
 'inherit.intent': ('policy','inherit',{'inherit'}), 'inherit.metric': ('policy','inherit',{'inherit'}),
 'inherit.scope': ('policy','replace',{'replace'}), 'inherit.period': ('policy','inherit',{'inherit'}),
 'inherit.entity': ('policy','replace',{'replace'}), 'inherit.filter': ('policy','conditional',{'conditional','reset'}),
 'inherit.direction': ('policy','reevaluate',{'reevaluate','inherit'}),
 'inherit.result': ('policy','never',{'never'}),
 'inherit.excluded_drivers': ('policy','inherit',{'inherit','reset'}),
 'inherit.result_references': ('policy','basis_bound',{'basis_bound'}),
}

# v5 finite grammars and build-time configuration, not learned parameters.
GRAMMARS = {'MOVEMENT_REPORT','MOVEMENT_CHECK','DRIVER_AMOUNT','DRIVER_CHECK','ENTITY_AMOUNT','RANKING','COMPARISON','HISTORY','RECONCILIATION','OFFSETS','CONCENTRATION','MAIN_DRIVER'}
ACTIONS.add('MOVEMENT_CHECK')
CONCEPTS.update({'MOVEMENT_CHECK_REQUEST','MOVEMENT_AMOUNT_REQUEST'})
SLOTS.update({'unit'})
HEADERS['commands.csv'].insert(5,'grammar')
HEADERS['fuzzy_config.csv'] = 'category,min_length,threshold,max_edits,min_margin,max_corrections,enabled,notes'.split(',')
HEADERS['units.csv'] = 'phrase,kind,multiplier,enabled,notes'.split(',')
HEADERS['temporal.csv'] = 'phrase,kind,value,enabled,notes'.split(',')
SETTINGS['max_fuzzy_unmatched_tokens'] = (int,12,1,24)

# v6: customer identities are runtime data, not human-managed language rules.
HEADERS.pop('aliases.csv', None)
