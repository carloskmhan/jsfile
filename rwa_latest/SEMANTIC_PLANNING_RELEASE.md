# 6.2 semantic planning release record

Base: `117de5464a1b22e87e1bc48bd369b06daeb91e01` in `carloskmhan/jsfile/rwa_latest`.
Component release: `6.2.0-semantic-planning-review`. Default remains off.

## Implemented

Pre-command semantic contracts for bounded rank/filter/driver roles, compound context
replacement through existing handlers, matching scope-only authorised routing, focused
clarification, and observational audits of legacy aggregation/binding concerns.
Three shapes are added to the existing optional composition CSV. The additive migration
preserves custom sources and uses the existing Workbench transactional compiler path.
No financial module, source dataset, customer catalogue, permission boundary, custom
`demo.html`, `loading_screen.css`, or Tableau configuration is changed.

## Verification during this implementation

- Original 851 question behaviors identical in off, shadow and guarded: 2,553 comparisons.
- Existing 6.1 composition and safety suite: 201 checks; 93 lexical-path acceptances retained.
- New planning/safety suite: 110 checks (42 counted new-path test invocations).
- Seeded numerical property suite: 98 checks, with independent expected ranking/filter arithmetic.
- Additive installer: 5 checks, including idempotency, disabled/custom rules and conflict atomicity.
- Actual Chromium bundled application + synthetic provider: 16 checks, zero page errors.
- Existing compiler, manager, historical, builder, robustness and mock-Tableau gates retained.

The browser run is local synthetic evidence, not live bank Tableau/SSO UAT.
The GitHub workflow artifact records the actual CI run and source commit; CI does not
claim to rerun the local browser suite. Tests authored here are not an independent blind
holdout or a MiniLM A/B comparison. No source or golden regression expectations were
redefined to bless new output.

## Known compatibility boundary

Accepted legacy requests remain authoritative. `net/gross` and some old rank/balance
binding differences are detected in read-only diagnostics, not automatically corrected.
This release must not be represented as resolving those existing financial ambiguities.
See SEMANTIC_PLANNING.md for concrete examples, supported forms and deployment steps.

## Rollback

Set `compositionMode` to `off` and refresh to disable added interpretation/routing.
Restore the previous matched code/rule bundle for a code rollback. The installer prints
its Workbench backup ID when it changes sources. Keep customised configuration and HTML/CSS.
