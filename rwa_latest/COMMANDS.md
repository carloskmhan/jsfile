# Language CSV maintenance — connected v6

> **Simple manager update (2.0.0):** `python rule_manager.py` now opens the capability Home and shared Add/Edit/Fix wizard. The former technical editor remains at `/advanced`. See `SIMPLE_RULE_MANAGER.md`. Existing executable CSV schemas and the compiler are unchanged; optional `capabilities.csv` and `capability_examples.csv` record local card/example ownership only. Customer aliases are still not managed here.

Canonical sources: commands.csv, synonyms.csv, followups.csv, settings.csv, fuzzy_config.csv, units.csv, temporal.csv in rules/. These seven schemas retain the v5 meanings. No customer aliases.csv is used or emitted. A populated legacy alias source is explicitly rejected by the compiler; an empty legacy header is tolerated only for migration.

```bash
python build_command_patterns.py
python build_command_patterns.py --check
python rule_manager.py
```

Use the local browser workbench to add/edit/delete expressions, validate a draft, test the real parser, then explicitly save with backups. The compiled command_patterns.txt is generated; never hand-edit it. A failed compile keeps the old artifact. Build success validates schema/consistency, not business correctness or bank approval.

Example new synonym row (only if not already present):

```csv
ROOT,take me through,1,true,Approved movement explanation expression
```

Column order is concept,phrase,weight,enabled,notes. Add phrases, not company-specific full questions. Follow-up rows map existing finite patch types such as REPLACE_SCOPE to captures; old state + patch yields new parameters, never old amounts. Commands select existing action/grammar functions, not arbitrary code. New calculations and semantic categories require source review/tests.

Question/company spelling candidates in live operation come from the authorized runtime index and loaded clients. Details in JSON are recognized as literal driver labels. Do not insert confidential client names into a shared synonym rule as a replacement alias catalog. An unavailable group cannot become authorized by adding a phrase.

Numeric/date rules keep their fixed meanings. Safe fuzzy remains deterministic, bounded and fail-closed for ambiguous candidates; source names are not automatically modified or persisted. Same-spelling runtime name priorities are the same for exact matching and fuzzy candidate recovery. Different ambiguous IDs/spellings are never ranked into silent selection.

When changing rules, test positive paraphrases, near opposites, exclusions, ambiguous IDs, context patches and unsupported requests. `node tools/evaluate.mjs tests/my_regression.csv reports/my_regression.json` uses developer fixtures. The included corpora are known development sets, not blind holdouts.
