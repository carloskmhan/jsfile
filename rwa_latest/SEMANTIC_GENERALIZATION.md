# Semantic generalization — 6.3.0 review

This extends `6.2.0-semantic-planning-review` without adding MiniLM, embeddings, ML,
ONNX or external AI. The existing financial executors, Tableau authorisation boundary,
customer catalogue, rule compiler and preview/confirmation workflow remain authoritative.

## What changed

### 1. Bounded competing semantic candidates

When the legacy parser and the frame-first planner produce materially different meanings,
the engine records a deterministic candidate graph instead of silently choosing one.
The graph is capped by the existing `maxCandidates` setting and contains typed ACTION,
TARGET, MEASURE, PERIOD, RANK, predicate and relation structures. There is no learned
probability and no weaker-command fallback.

In `guarded` mode, material disagreements now stop before execution and ask for a clearer
measure/filter/scope/period. `off` preserves the legacy path and `shadow` remains
observational. This deliberately changes the prior 6.2 policy for reviewed ambiguity
cases such as undefined `net/gross` aggregation and a material rank/filter binding
mismatch; it does not redefine financial formulas.

### 2. Typed predicate and relation trees

Frame-first plans expose an `AND` predicate tree for numeric filters and exclusions, plus
a typed relation tree for ranking, driver roles and attribution exclusions. The current
executor still accepts only combinations already supported by its validation contract;
the tree prevents a modifier from disappearing merely because another clause matched.

### 3. Ranked-result reference composition

A successful group/entity ranking can now be followed by a combined ranked reference and
month replacement, for example:

```text
What about the second one, but in June 2026?
How about the next one in July 2026?
```

The selected reference is ID-bound to the last successful result set. The reporting month
is applied in the same context projection. Parsing, routing, preview cancellation and
failed execution remain state-safe. This does not introduce free-form pronoun resolution
or copy any prior result amounts.

### 4. Semantic abstraction hierarchy and productive morphology

Reviewed lexical families now carry an inspectable abstraction path, for example:

```text
fuelled -> CAUSE_LEMMA -> RELATION -> ATTRIBUTION
plunged -> FALL_LEMMA -> MOTION -> DOWN
pushed higher -> CAUSE_UP -> RELATION -> ATTRIBUTION + MOTION_UP
```

Only explicit `*_LEMMA` families receive deterministic morphology. This is bounded,
rule-derived morphology, not stemming over arbitrary words. Exact customer names/IDs,
dynamic driver labels and conflicting registered phrases keep ownership. A longer
reviewed phrase may absorb a shorter exact subphrase only when all overlapping concepts
are fully contained and semantically compatible.

Reviewed examples include `fuel/fueled/fuelled/fueling`, `surge`, `soar`, `accelerate`,
`dip`, `plunge`, `tumble`, `lie/lay behind`, `stem from`, `result from`, and bounded
causal-direction forms. These expand natural wording without registering complete
customer-specific sentences.

## Activation

The existing setting is unchanged:

```json
"compositionMode": "guarded"
```

`off` keeps legacy behavior. `shadow` computes diagnostics without changing returned
results. `guarded` enables reviewed lexical recovery, frame-first planning, reference
composition and the consistency gate. Reload after changing the setting.

For an existing 6.2 project with custom optional CSV rules, stop the Rule Manager, back
up the folder, merge the 6.3 code, then run once:

```bash
python install_semantic_generalization.py
python build_command_patterns.py --check
```

The installer only adds missing 6.3 shapes and lexical entries, preserves existing rows
and disabled custom shapes, compiles through the existing Workbench transaction path,
and is idempotent. It is not a startup script.

## Examples to test in chat

Use authorised group names/IDs and available months in your deployment.

```text
What fuelled Samsung RWA increase in July 2026?
What lay behind Samsung RWA increase in July 2026?
What pushed Samsung RWA higher in July 2026?
Has Samsung RWA plunged in July 2026?
```

After executing a ranking:

```text
Show top 5 groups by RWA increase in July 2026
What about the second one, but in June 2026?
```

The following reviewed ambiguity no longer executes in `guarded` mode until the meaning
is made explicit:

```text
Show top 5 groups by RWA increase with RWA balance above 25m in July 2026
Why has Samsung RWA risen in July 2026 net?
```

## Verification boundary

The regression suite continues to compare all 851 original cases in `off`, `shadow` and
`guarded` modes. Additional tests cover productive morphology, phrase ownership,
candidate graphs, consistency clarification, typed predicate/relation trees, ID-bound
reference composition and additive migration. These are developer-authored tests, not an
independently collected blind natural-language corpus and not evidence of MiniLM parity.

Remaining work includes broader discourse/reference grammar, additional reviewed semantic
families, multiple independently executable numeric predicates where the financial
executor explicitly supports them, confidence calibration on a blind holdout, and a
same-corpus MiniLM versus deterministic A/B benchmark.
