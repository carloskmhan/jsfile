## 6.3 semantic generalization review

See [SEMANTIC_GENERALIZATION.md](SEMANTIC_GENERALIZATION.md) for bounded candidate graphs, guarded legacy/frame consistency checks, typed predicate/relation trees, ranked-result reference composition, and expanded deterministic lexical abstraction/morphology. See [SEMANTIC_GENERALIZATION_RELEASE.md](SEMANTIC_GENERALIZATION_RELEASE.md) for the release boundary and verification record.

## 6.2 extension

The 6.1 behavior described below remains the compatibility baseline. [SEMANTIC_PLANNING.md](SEMANTIC_PLANNING.md) describes the additional frame-first path, atomic compound context and read-only accepted-result audit. [SEMANTIC_PLANNING_RELEASE.md](SEMANTIC_PLANNING_RELEASE.md) separates implemented features from remaining limitations.

# Compositional Semantic Generalization — guarded v6 extension

Version: `6.1.0-composition-review`. Legacy parser trace version deliberately remains
`6.0.12-history-percent-review` so unchanged requests retain their exact contract.
The generated language artifact remains schema **5**; the optional composition section
has its own schema **1**. No ML, learned embeddings, model download or external AI call.

## Deployment

The default is **off**. Keep the seven existing rule CSVs, financial modules, customer
catalogue, Tableau permissions, thresholds and custom HTML/CSS unchanged.

Add one property to your **existing** `tableau_config.txt` (do not replace your server,
SSO, scope or catalogue settings with the sample configuration):

```json
"compositionMode": "shadow"
```

Use `guarded` to enable the reviewed new forms after checking your local data and
permissions; use `off` to roll back interpretation immediately. Reload the page after
changing the configuration. A mode or rule-registry change invalidates a pending preview.
Programmatic clients may call `client.setCompositionMode('guarded')`; an existing report
still needs a new preview and confirmation. `RuleClient.setData()` forwards the mode.

`shadow` returns exactly the original result. It stores only in-memory diagnostic data
at `engine.parser.lastComposition`, never in conversation state or external telemetry.
A new accepted request includes `explain.composition` with its frame and rule evidence.
No UI or admin layout changes are required.

## What is implemented

A canonical, inspectable frame carries ACTION, TARGET, MEASURE, DIRECTION, PERIOD,
RANK, FILTER, EXCLUSION and RELATION. It retains ID-bearing scope, lexical spans,
provenance, unresolved content and contradictions. Monthly-extreme selection is
separate from cross-group ordering; financial denominators are not recomputed here.

Reviewed forms such as `grown`, `climbed`, `contracted`, `triggered` and `precipitated`
fill **uncovered original-text spans**. Existing complete customer names/IDs, dictionary
phrases and dynamic driver labels keep ownership. No question is rewritten into English;
no fuzzy threshold or unknown-word limit is relaxed. Existing fuzzy behavior remains
unchanged and is authoritative when the original parser already accepts.

Five bounded grammar shapes combine these primitives with existing typed slots:
recorded attribution, movement/driver check, contribution, ranking and context modifier.
Examples using synthetic catalogue names:

```text
What triggered Samsung RWA increase in June 2026?
Why has Toyota RWA grown in July 2026?
In June 2026, explain why Samsung RWA has contracted
Show top 5 groups whose RWA expanded the most in July 2026
Did Samsung RWA contract in July 2026?
Same but exclude EAD
Same but include EAD
```

The last two require an executed compatible report, not a preview. Their entire typed
suffix must be consumed; `Same but exclude EAD only` is not accepted. They reuse the
existing EXCLUDE/INCLUDE handlers. Existing `How about Toyota?`, `And June?` and ranked
result references work after successful new requests. They are not new memory systems.
Historical-peak reference restrictions remain in place.

Scope routing does not gain new scope primitives: no new GROUP/ENTITY/COMPARE/RANK
aliases are introduced. Existing authorised `planDataRequest()` therefore remains
unchanged. New-form tests compare its requested scope with the canonical request, and
the browser test exercises actual loading, preview and execution with a synthetic provider.

## Guardrails and limits

The original parser runs first. Original accepted answers and genuine ambiguity or
constraint rejection remain authoritative. Only a narrowly checked language-coverage
gap is eligible. A composed candidate passes the SAME slots, relation analysis,
command scoring, winning-command grammar, constraints and unknown-content checks.
The new grammar then checks role attachment; it cannot try a weaker executor when the
winning one is invalid. New interpretation fails closed on internal errors.

`whose` is supported only between an explicit ranking subject and RWA. `but` is supported
only in the typed `same but exclude/include` construction. New lexical composition of
arbitrary registered follow-up patterns is not enabled. New historical/compare/forecast
capabilities, free-form causal inference and general Basel policy Q&A are **not** added.
Most new forms require explicit RWA wording; typed context modifiers inherit its basis.

Runtime composition is bounded to 256 lexical rows, 16 grammar rows, 16 added matches
and four viable candidates. It does not discard financial qualifiers to improve coverage.
Invalid optional files fail compilation without replacing the approved artifact.

## CSV authoring and Rule Manager preservation

Optional source files must be supplied **as a pair**:

* `rules/lexical_families.csv`: `family_id,phrase,enabled,notes`.
* `rules/composition_rules.csv`: `rule_id,shape,enabled,notes`.

Families and structural shapes are finite, reviewed code definitions. Structural link
literals are fixed. No regex, code, customer records, IDs, numerals, date terms or protected
financial qualifiers may be inserted as disposable language. Existing synonym conflicts
are rejected. Source hashes include both optional files.

```bash
python build_command_patterns.py
python build_command_patterns.py --check
```

With neither optional source present, compilation produces the byte-identical original
artifact. With the pair present, deploy the regenerated artifact **together with all new
and changed JavaScript modules**. The runtime validates the optional section as well.

The existing Rule Manager stays a seven-table/simple-wizard UI. The optional pair is
preserved as read-only pass-through source during validation, save, backup and restore.
Changing it externally invalidates stale drafts. Restart the manager after editing source
code. A friendly editor for these advanced grammar definitions is not added in this release.

## Verification

```bash
npm test
npm run test:composition
# Optional developer-only browser dependency: Playwright + /usr/bin/chromium
python tests/composition_browser.py
# Regenerate a synthetic standalone demo after selecting a compositionMode in config:
python tools/build_standalone.py
```

The immutable baseline snapshots were captured from a separate unchanged checkout of
`af44159f4ce854833eee1611b24b52b1b65f9100`. They hash full parsed output, actual answer,
results, warnings, state and authorised routing. Only `explain.latencyMs` is excluded.
The release test does not regenerate or bless these snapshots. It tests off, shadow and
guarded against all 851 original questions.

`tests/composition_cases.json` is explicitly developer-authored/generated, not a blind
holdout. Its source generator is `tools/build_composition_cases.py`. Two pre-existing
acceptances are separately labelled as legacy observations, NOT successful hard-negative
rejections. `tools/evaluate.mjs ... --composition-mode guarded` supports a separately
collected holdout; existing holdout-manifest checks remain available.

### Unresolved / not demonstrated

The legacy synonym dictionary maps both `net` and `gross` to TOTAL, and the legacy fuzzy
path can recover `risen` as `rises`. This release preserves that behavior, records the
observations, and does not claim that gross/net semantics are correct. New composition
with these qualifiers is not widened. Their business interpretation needs a separate
reviewed change rather than silently altering legacy accepted results.

Broader language families, context grammar, fuzzy improvements, general regulatory
knowledge, confidence calibration, independently blind generalization and MiniLM A/B
performance remain future work. Passing these developer tests is not bank UAT, production
approval, a guarantee over all questions, or proof of MiniLM-level performance.
