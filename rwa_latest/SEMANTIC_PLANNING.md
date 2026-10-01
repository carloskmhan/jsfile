## 6.3 semantic generalization review

See [SEMANTIC_GENERALIZATION.md](SEMANTIC_GENERALIZATION.md) for bounded candidate graphs, guarded legacy/frame consistency checks, typed predicate/relation trees, ranked-result reference composition, and expanded deterministic lexical abstraction/morphology. See [SEMANTIC_GENERALIZATION_RELEASE.md](SEMANTIC_GENERALIZATION_RELEASE.md) for the release boundary and verification record.

# Semantic planning — 6.2.0 review

This extends `6.1.0-composition-review` at GitHub commit
`117de5464a1b22e87e1bc48bd369b06daeb91e01`, without replacing the v6 engine.
No model, embedding, ONNX, external AI, financial formula or permission change is added.
The original legacy pipeline version remains in legacy traces for exact compatibility;
the added frame and package identify the 6.2 review release.

## Enable / upgrade

The existing setting is sufficient:

```json
"compositionMode": "guarded"
```

`off` (default) returns the original parser behavior. `shadow` computes diagnostics
without changing returned results, loading scope or state. `guarded` enables reviewed
new interpretations. Refresh after configuration changes. The existing mode setter
invalidates pending previews. Do not replace bank server/SSO/scope settings with samples.

For an existing 6.1 installation with custom rule CSVs, stop the local Rule Manager,
back up the folder, merge the new code (not sample CSVs/configuration), then run:

```bash
python install_semantic_planning.py
```

This adds missing planning shapes to the existing `rules/composition_rules.csv`, retains
custom IDs, old source bytes and already-disabled shapes, compiles the existing CSVs,
and uses the Workbench OS lock, source/revision checks, transaction journal, backup and
rollback. It is idempotent; it is not an application startup requirement. The generated
artifact is replaced last. A compiler or conflicting-ID failure does not publish changes.
A missing 6.1 optional CSV pair is an error, not permission to install sample rules.

For normal later rule edits, use the existing Rule Manager/compiler. For standalone
HTML deployment also run `python tools/build_standalone.py` after setting the desired mode.
The repository's generated standalone defaults to off because its sample config does.

## Architecture and preserved boundary

The 6.1 parser still runs first, and its accepted results remain authoritative by default.
Its lexical extension is retained unchanged in precedence and safety thresholds.
For an eligible, completely matched new structural form:

1. Protect original customer IDs/names, driver labels, dates and numbers.
2. Form typed original-span tokens. No alternate English question is generated.
3. Parse bounded independent components: target, ranking measure, month, balance
   predicate, attributed-driver exclusion or compound context replacements.
4. Construct an ACTION/TARGET/MEASURE/DIRECTION/PERIOD/RANK/FILTER/EXCLUSION/RELATION
   frame and an ID-bearing contract **before command scoring**.
5. Pass the structured slots and relations into existing context projection, command
   scoring, winning-command grammar and constraint validation.
6. Require the winning command to preserve every bound field in that contract.
   A different/weaker executor is never substituted after rejection.
7. Use the same preview, fresh authorised data, executor and successful-state commit.

This is a bounded frame-first path, not a general dependency parser or arbitrary parse
forest. A single unambiguous contract is required; unsupported structures fail rather
than choosing a lossy interpretation. There are at most four clauses and four distinct
selected drivers. Existing input, number, unit, temporal and confidence limits remain.
New grammar activation is canonical in `rules/composition_rules.csv`:

| Shape | Purpose |
|---|---|
| RANKING_ROLES | Separate ranking measure from a closing-balance predicate and driver roles. |
| COMPOUND_CONTEXT | Collect group, month and one include/exclude operation before one projection. |
| ACCEPTED_AUDIT | Read-only review of undefined aggregation or recognised role disagreements. |

Structural keywords describe finite reviewed grammar; the CSV does not execute code.
Older artifacts without these shapes continue to work and do not enable the new path.

## Examples and intended meaning

Use actual authorised group names/IDs and loaded reporting months in a live deployment.
The customer names below are from the existing synthetic fixtures.

```text
Show top 5 groups by percentage increase in July 2026, excluding groups with RWA below 25m
Show top 5 groups by RWA percentage increase with RWA balance above 25m in July 2026
Show top 3 entities for CG0001 by percentage increase with RWA balance above 25m in July 2026
```

The rank measure is percentage change. The predicate measure is closing RWA balance,
using the same selected month. Excluding balances below 25m means keeping balances
**greater than or equal to** 25m. The filter is applied before taking top N, using the
existing executor. These structured cross-measure reports require a single month;
new historical, window, forecasting and counterfactual calculations are not added.

The planner also represents “rank by EAD contribution to RWA increase” separately from
“rank by RWA increase after excluding EAD contribution”. Where the old parser already
accepts those forms, it remains authoritative and the role comparison is diagnostic.
Driver exclusion still subtracts recorded attribution, not a constant-factor RWA simulation.

After executing a compatible report (not merely previewing it):

```text
What triggered Samsung RWA increase in July 2026?
Same but exclude EAD
Same analysis for Toyota in June 2026, but include EAD this time
Same report in July 2026 for Toyota but exclude EAD
```

Group, month and driver changes are collected first and passed through the existing
context handler once. Failed parsing, cancelled/expired previews and failed execution
leave the last successful state unchanged. Group changes retain existing inheritance
policies, including clearing incompatible entity exclusions. No result amounts are copied.

Compound scope replacement currently names a GROUP. Its prior report must be a group/entity
movement report or entity ranking. It does not reinterpret a portfolio ranking, historical
peak, comparison, contribution-specific report or arbitrary result reference.
New scope-only routing uses an explicit authorised replacement ID, or the last executed
ID when there is no replacement. A changed UI dropdown must not silently load another
group. An unknown/removed group is an error; uncertainty never triggers portfolio loading.

Unsupported qualifiers are not ignored:

```text
Same analysis for Toyota in June 2026 but exclude EAD only
Show top 5 groups by percentage increase excluding groups with RWA below 25%
Show top 5 groups by percentage increase excluding groups with RWA below 25m unless EAD increased
```

When the structured request is recognised but incomplete, `explain.clarification` names
the unresolved field and supplies a focused message. It does not install a pending state
patch or execute an answer after an arbitrary one-word reply. A corrected request still
needs an ordinary preview and confirmation.

## Read-only audit: intentionally not an automatic fix

Legacy synonyms still map `net` and `gross` to TOTAL. The audit records
`UNDEFINED_AGGREGATION_BASIS`; it does not invent the financial definition.
The legacy parser can also treat `by RWA increase with RWA balance above ...` as a balance
ranking. A different complete structured interpretation is recorded as
`ROLE_BINDING_DISAGREEMENT`, but the legacy result is NOT silently changed in this release.
Protected customer/driver labels containing those words do not trigger that word audit.

Diagnostics are in memory only:

- `engine.parser.lastSemanticPlan`: proposed pre-selection frame or targeted failure.
- `engine.parser.lastSemanticAudit`: observations on authoritative legacy acceptances.
- `engine.parser.lastComposition`: existing lexical composition diagnostics.

For developer inspection against synthetic data, without executing any calculation:

```bash
node tools/inspect_semantics.mjs "Show top 5 groups by RWA increase with RWA balance above 25m in July 2026"
```

A change to previously accepted meaning, or blocking accepted audit findings, requires a
separate explicitly reviewed compatibility policy. Do not describe these legacy findings
as financially corrected or treat audit visibility as production approval.

## Verification and remaining work

```bash
npm test
node tests/test_semantic_planning.mjs
node tests/planning_properties.mjs
python tests/test_planning_install.py
python tests/semantic_planning_browser.py
```

The last command additionally requires Playwright and Chromium; `CHROMIUM_PATH` can select
a local browser. It operates on the actual bundled application with a synthetic provider,
not bank SSO. The normal npm gate uses Node/Python and no new runtime dependencies.

The new tests use hand-authored language, metamorphic changes, fixed synthetic edge cases
and seeded numeric data with separately calculated expected membership/order. They are
not an independent blind natural-language evaluation. Existing holdout manifest tooling
and `tools/evaluate.mjs --composition-mode guarded --require-holdout --holdout-manifest ...`
remain available for a separately collected corpus. No weights or fuzzy thresholds were
fitted or lowered. No MiniLM A/B result or calibrated probability is claimed.

Still outside this release: unrestricted semantic trees, broader discourse/reference
composition, arbitrary combinations of filters, new financial calculations, automatic
net/gross correction, broad regulatory knowledge and independent MiniLM parity evidence.
