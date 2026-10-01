# 6.3 semantic generalization release record

Base: `6.2.0-semantic-planning-review`.
Component release: `6.3.0-semantic-generalization-review`. Default remains `off`.

Implemented: bounded legacy-vs-frame candidate graphs, guarded semantic consistency
clarification, typed predicate/relation trees, ranked-result + month reference composition,
a reviewed abstraction hierarchy, productive morphology for explicit lemma families, and
compatible longer-phrase ownership. No ML/embedding/runtime AI dependency was added.

Preserved: financial calculation modules, authorised Tableau scope, customer IDs, preview
confirmation, original seven CSV rule sources, user `demo.html`, `loading_screen.css` and
Tableau configuration. The ordinary-chat `Checks:` presentation fix already on main is
retained; warning/evidence data remain intact.

Verification for this release must include the full `npm test` gate, the immutable 851
legacy behavior comparison in all three modes, additive migration tests, and the focused
semantic-generalization suite. Browser/live-bank UAT and an independent MiniLM A/B
benchmark are separate evidence and are not claimed here.
