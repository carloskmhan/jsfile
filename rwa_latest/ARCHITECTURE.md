# Connected architecture

Language path (no financial calculations): normalise → exact longest names/driver phrases → reviewed phrase dictionary → bounded typo recovery → typed numbers/periods → relations/slots → explicit manual features/scores → constraints/ambiguity → context patch → ID-bearing deterministic plan.

Identity path: authenticated active Tableau dashboard → RWA_GROUP_INDEX (ID/name only) → in-memory ID Map/trie and explicit finite name variants → query target IDs. No aliases.csv, static catalogUrl or customer names in command_patterns.txt. Local synthetic mode builds the same index from sample CSV only.

Data path: validated group ID list → serialized exact replace filter on RWA_DATA → complete JSON validation → ID-grain rows → existing calculations → deterministic templates. The index is rechecked before questions, after detail reads and before confirmation. Every query loads its required detail again; no old numerical answer is inherited. Result references contain IDs/names/ranks only. One pending snapshot can be confirmed for up to the existing two-minute validity window, provided source/generation checks still hold; this is not a new database transaction or bank authorization proof.

The adapter preserves builder provenance and safe current attributes. Derived previous RWA and algebraic reconciliation are qualified. Dynamic detail drivers are dictionary entries from authorized loaded data. Optional explicitly supplied family mappings can drive amounts/exclusions, not unconstrained causal inference. No family is inferred from a substring. Missing driver observations are not zeros.

The compiler/CSV management path is independent of Tableau authentication: seven language CSVs → standard-library Python validation → atomic command_patterns.txt. The English local workbench wraps that existing compiler and browser engine; it has no live Tableau connection and never automatically deploys a rule file.

Modules: group_catalog.js handles ID/name transport and lookup; tableau_adapter.js handles the two-sheet provider; driver_catalog.js handles exact detail/family selections; csv_adapter.js validates JSON rows/provenance; app.js coordinates the existing UI; semantic/* interpret; rwa_engine.js calculates; rule_client.js preserves preview/commit safeguards.

Limits are explicit, incomplete responses stop. Local counters/signatures detect change but do not authenticate identities. The server must authorize index and nested details. See TABLEAU_SETUP.md and CISO_SECURITY.md.
