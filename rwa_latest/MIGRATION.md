# v5.0.2 / local workbench → v6

1. Keep the current deployment and working data-builder mapping as a rollback copy. Install v6 into a NEW staging directory; do not overwrite only the rule TXT or adapter.
2. All v6 root JS, `semantic/`, HTML/CSS and generated command_patterns.txt must be deployed together. `loading_screen.js`, `loading_screen.css`, original styles and timing are preserved.
3. Preserve and merge your approved Tableau URL, classic SDK URL, worksheet/field/filter names, origin allowlist, current reporting month and size limits. Two distinct worksheet names and `catalogSource: tableau` are now mandatory for live mode. Old `catalogUrl` is not used.
4. Customer identities are no longer in rule sources or artifacts. Archive any populated `rules/aliases.csv` outside the deployment/project rule directory. The v6 compiler refuses it. Do not move real customer names into synonyms.csv or notes as a workaround.
5. Merge custom expressions, commands, follow-ups, fuzzy/number/period settings into the seven CSV schemas. New calculation types still require source changes. Compile and test. The generated TXT has an empty aliases array and runtime_catalog marker.
6. Keep your generated v1.0.8 `tableau_data.csv` in Tableau ingestion, not the public web folder. Do not replace it with synthetic `tableau_sample.csv`. Build-derived prev_rwa is now clearly labelled; zero residual is not independent validation.
7. Publish/check `RWA_GROUP_INDEX` and `RWA_DATA` as in TABLEAU_SETUP.md. No current-group UI filter may narrow the index; RLS must remain on both.
8. Configure and stage the web subset. Run actual multi-user security/SSO/HTTP and complete-data checks, then record normal approval. The review boolean does not authenticate approval.
9. The English local workbench stays `python rule_manager.py`; it now edits seven language CSVs and uses local data IDs for tests. Old customer-alias drafts/backups are not compatible with the new source schema. Preserve old backups with the old project, do not restore them into v6.
10. After the initial full migration, ordinary phrase/weight changes remain CSV → compiler → command_patterns.txt. Rebuild standalone_demo.html separately with `python tools/build_standalone.py` if using it.

The unchanged v1.0.8 converter is supplied in `data_builder/` only for reproducibility, with a mapping EXAMPLE. Use your working original mapping explicitly with `--config`; do not replace it unnecessarily.
