# v6 verification scope (not a new MiniLM benchmark)

This release changes live identity lookup, two-sheet transport and ID-based data handling. No new MiniLM A/B comparison or independent holdout has been run. The old optional tools/ab_minilm.py and related tools are retained for development and require separately approved original model assets. Those assets are not bundled or downloaded automatically.

The current measured results are in reports/release_summary.json. Known v5 question sets are rerun without rewriting their expected query plans; new connected tests are developer-authored synthetic fixtures, not unseen user accuracy. Some obsolete alias-source tests were migrated to 'no customer data in generated artifact'; original expectations are retained as source .txt records. Runtime same-name ID ambiguity is tested directly instead.

A 50,001-group index test uses a v2-shaped mock in Node. It measures local index/dictionary work, not Tableau query speed or network transfer. Do not compare those timings to a model-only MiniLM latency number. Total browser-native/SDK memory and real bank cold loads are unmeasured.

The browser's local HTTP navigation was blocked by administrator policy. This was not bypassed. In-memory DOM tests exercise the same modules with synthetic/sample/mock data; local Python HTTP tests exercise the rule-workbench API separately. Neither proves real Tableau, SSO, RLS, MIME, CORS or production CSP behavior.

No 99% equivalence, universal superiority, security approval or non-AI exemption is claimed.
