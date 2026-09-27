# Publication notes

This is a source consolidation, not a new engine release or a fix to the source data.

The following latest functional files were overlaid without changing their contents: SSO startup files; the corrected group_catalog.js; the main-contributors/comparison-note rwa_engine.js; the latest current-snapshot diagnostic data builder; the simplified manager patch.

The builder still rejects conflicting current RWA/current attributes for one group + LEID + reporting month. Raw prev_* values are ignored under the existing agreed builder policy. No first/MAX/SUM choice was added to suppress current-side conflicts. Derived previous RWA is a comparison basis, not independently observed prior-month RWA.

## Existing test caveat

The unchanged legacy builder integration assertion requires the long phrase `NOT an independently observed` in ordinary answer prose. The user's earlier display patch intentionally moved that recurring note out of ordinary prose while preserving metadata. The previously recorded manager regression notes identify this stale display assertion. It is not hidden or changed merely to label the entire historical runner green.

The 50,001-name synthetic provider stress case in tests/connected_tableau.mjs can take substantial time. Publication-time execution in this environment was stopped after the local 120-second command budget before that suite reported completion. That interruption is not counted as a pass or a detected product defect. Other source checks and fresh test results, when run, are reported separately.

Historical reports describe their own source snapshots and dates. Real bank Tableau/SSO, entitlement boundaries, response sizes, performance and data completeness require staging validation. This public source snapshot is not bank approval.
