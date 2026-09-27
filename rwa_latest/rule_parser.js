/** Compatibility facade: existing UI/analytics import this file; CSV semantic modules do interpretation. */
export {SemanticEngine as RuleParser, RULE_VERSION} from './semantic/engine.js';
export {norm,aliasRe} from './semantic/text.js';
export {monthRange,shiftMonth} from './semantic/periods.js';
export {catalogMentions,findNames} from './semantic/dictionary.js';
export function portfolioRequest(q){return /\b(top|rank|ranking|largest|biggest|leading|list|which|show)\b.*\b(groups|clients|client groups)\b|\b(peers?|benchmark|portfolio)\b/i.test(q);}
