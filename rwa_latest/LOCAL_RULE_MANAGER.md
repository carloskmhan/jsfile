# Local rule workbench — English connected v6 edition

> **Simple manager update (2.0.0):** `python rule_manager.py` now opens the capability Home and shared Add/Edit/Fix wizard. The former technical editor remains at `/advanced`. See `SIMPLE_RULE_MANAGER.md`. Existing executable CSV schemas and the compiler are unchanged; optional `capabilities.csv` and `capability_examples.csv` record local card/example ownership only. Customer aliases are still not managed here.

Run `python rule_manager.py` in the FULL v6 source directory (Python 3.10+, standard library only). Browser URL: http://127.0.0.1:8765/. Alternatively pass --port or --project to a trusted full v6 project. Stop the old manager before upgrading. Do not expose this loopback server as a production service.

The UI edits seven CSVs: expressions/synonyms, follow-ups, commands/weights, typo safeguards, number units, periods, context settings. Customer alias editing has been removed. Customer metadata is owned by the authenticated Tableau index, not the rule file.

Workflow: edit browser draft → Validate draft using existing compiler → inspect/test with real browser engine → explicit Save → local source/artifact backup and replacement. Save is not automatic deployment. Standard change approval and rollback remain required. Server path restrictions, Host/origin/CSRF checks and transaction journal are retained; they are not a security certification.

Local question tests read tableau_sample.csv or an explicitly selected local CSV/JSON file, not the bank Tableau service. Group choices show names AND IDs so duplicate names remain distinct. Raw previous-side fields are not restored by this test UI. Imported test data remain browser-local; be careful before downloading debug/result JSON.

The compiled output contains zero customer aliases. Legacy v5 alias-bearing backups must be retained with the v5 project, not restored into this seven-table manager. Use your reviewed deployment process to copy a successful generated command_patterns.txt into the v6 web folder. The standalone demo requires a separate build.
