# Composition release record

Base: `af44159f4ce854833eee1611b24b52b1b65f9100` (`rwa_latest/`).
Release: `6.1.0-composition-review`, default OFF.

## Scope

Implemented canonical semantic evidence, protected-span lexical families, bounded
structural composition, typed `same but exclude/include` patches, optional CSV compiler
and runtime validation, transactional manager preservation, preview-mode binding,
full-behavior baseline snapshots and developer/browser tests. No financial executor,
Tableau authorization, custom demo HTML/CSS or user server configuration changes.

## Verification recorded during implementation

- 851 original full behaviors identical in off, shadow and guarded (2,553 comparisons).
- 201 composition/safety assertions; 93 positive examples use the new interpretation path.
- 17 optional compiler/manager tests, including byte-identical no-extension build,
  invalid-build atomicity, source conflicts, save/restore and stale-draft rejection.
- 84 existing mocked Tableau checks; 42 historical peak checks; 76 manager tests.
- Chromium actual bundled-app synthetic workflow: 7 checks, zero page errors.
- Existing 53 compiler safety checks retained.

The CI artifact is the authoritative per-run record for the complete `npm test` gate.
Browser checks were run locally with Chromium, not against the bank's live Tableau/SSO.
New-language tests were authored during development and must not be presented as blind
MiniLM comparison evidence. Two legacy gross/net observations are explicitly separated.

## Existing baseline test repair

The original builder integration test still searched for the full derived-basis note in
ordinary answer prose, although the released implementation already put it in
`warnings` and `methodologyNotes`. The assertion now requires the concise derived-basis
label in prose, the complete original note in both evidence fields, and its absence from
ordinary prose. Numerical assertions and financial implementation remain unchanged.

## Release / rollback

Deploy the new modules and regenerated `command_patterns.txt` as a matched set. Use
`compositionMode: shadow` before `guarded`; omitting the property keeps legacy behavior.
Change to `off` and reload to disable additional interpretations. Keep the old full bundle
for code rollback. Never overwrite customised HTML/CSS or Tableau configuration with
sample files. See COMPOSITION.md for remaining limitations and maintenance commands.
