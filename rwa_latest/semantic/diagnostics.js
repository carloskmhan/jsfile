/** Stable failure taxonomy for rule maintenance; no automatic tuning or feedback learning. */
export function failureCategory(code){
 if(/INPUT|NORMALIZ/.test(code))return 'NORMALIZATION';
 if(/FUZZY/.test(code))return 'FUZZY';
 if(/ENTITY|SCOPE/.test(code))return 'ENTITY';
 if(/UNIT/.test(code))return 'UNIT';
 if(/NUMBER/.test(code))return 'NUMBER';
 if(/PERIOD|TEMPORAL/.test(code))return 'TEMPORAL';
 if(/NEGAT/.test(code))return 'NEGATION';
 if(/RELATION|COMPARISON/.test(code))return 'RELATION';
 if(/CONTEXT/.test(code))return 'CONTEXT';
 if(/GRAMMAR|FORBIDDEN|CONSTRAINT|INVALID_COMMAND/.test(code))return 'CONSTRAINT';
 if(/SLOT/.test(code))return 'SLOT';
 if(/AMBIGUOUS|CONFIDENCE/.test(code))return 'AMBIGUITY';
 if(/UNSUPPORTED/.test(code))return 'UNSUPPORTED';
 return 'INTENT';
}
