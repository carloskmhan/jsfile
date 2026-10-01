## 6.3 semantic generalization review

See [SEMANTIC_GENERALIZATION.md](SEMANTIC_GENERALIZATION.md) for bounded candidate graphs, guarded legacy/frame consistency checks, typed predicate/relation trees, ranked-result reference composition, and expanded deterministic lexical abstraction/morphology. See [SEMANTIC_GENERALIZATION_RELEASE.md](SEMANTIC_GENERALIZATION_RELEASE.md) for the release boundary and verification record.

## 6.2 semantic planning review

The 6.2 extension adds frame-first role binding, compound context changes and read-only legacy audits. Default remains off. See [SEMANTIC_PLANNING.md](SEMANTIC_PLANNING.md) for activation, supported grammar, limitations and the additive custom-CSV upgrade, and [SEMANTIC_PLANNING_RELEASE.md](SEMANTIC_PLANNING_RELEASE.md) for verification.

# RWA deterministic engine - current consolidated sources

This directory contains the complete expanded source project, not an archive or an unpack-only bundle. Existing files at the repository root are unchanged. Start here rather than mixing historical root-level JavaScript files with this folder.

## Run the simple rule manager

```bash
cd rwa_latest
python rule_manager.py
```

Open http://127.0.0.1:8765/ . The home page provides Search, Add / Edit / Delete, Test engine and Fix interpretation. The old technical editor is under Advanced. Python 3.10+ is required; the ordinary manager does not require pip, Node, or a model.

## Preview the Q&A application

```bash
cd rwa_latest
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/demo.html . The separate standalone_demo.html is rebuilt from these modules with synthetic data for offline preview. Local development servers are not shared production servers.

## Included revisions

- Two Tableau worksheets: RWA_GROUP_INDEX for available names/IDs; RWA_DATA for complete detailed JSON.
- Sign In inside the five-second startup cover; the same Tableau iframe is hidden after successful initialization and remains the data connection.
- Query wave dots, batch progress, configurable batches up to 10,000, separate API/batch/total time budgets, and complete-response validation.
- Group-name token correction, including the false `for` alias collision fix.
- Multiple main contributing drivers and offsets, with a table.
- Repetitive long comparison-basis notes hidden from ordinary prose; provenance and material warnings retained.
- The simple English capability-management wizard over the existing CSV/compiler architecture.
- Builder 1.0.9-diagnostics in data_builder/.

## Configuration

The checked-in tableau_config.txt deliberately remains `sample` mode with placeholder URLs and live review acknowledgement false. Preserve your own approved bank settings outside this public source snapshot. Read TABLEAU_SETUP.md and PATCH_SSO_STARTUP.md before configuring the live connection. Both worksheets belong in the embedded dashboard and keep server-side RLS. Hiding the iframe is not authorization.

The ordinary rule source is the seven CSV files under rules/. The existing Python compiler generates command_patterns.txt. Customer names in live mode come from Tableau, not aliases.csv. The manager creates its management-only capability CSVs on the first explicit save; no separate database is introduced.

For conversion, copy data_builder/data_mapping.example.json to your local ignored data_builder/data_mapping.json and adapt your actual column headers. Do not overwrite an existing working mapping with the sample.

## Public snapshot and validation boundaries

Data shipped here are the synthetic development fixtures from the supplied v6 package. No live customer export, internal bank URL, credential, token, or screenshot is included in the assembled directory. Do not commit real CSV inputs, financial outputs, local settings or .rule_manager backups. Existing repository-root content is not changed or certified by this publication.

UPLOAD_MANIFEST.json records source archive fingerprints and individual file hashes. SHA256SUMS.txt verifies the expanded files. Reports under reports/, simple_manager_reports/ and validation_history/ are historical development evidence, not a new claim of bank UAT or production approval. PUBLICATION_NOTES.md records known limits. No safety threshold or financial aggregation rule was changed for upload.

See SIMPLE_RULE_MANAGER.md for management, README_V6_BASE.md for the base design, and PUBLICATION_NOTES.md before running the legacy aggregate test runner.


## 6.0.12 chat UX and historical monthly percentage peaks

The current source includes aligned confirmation buttons, immediate scrolling, progressive display of completed answers, 20 clickable examples, folded routine calculation notes, and the historical highest/lowest monthly percentage report. The checked-in CSVs and generated rules are upgraded together. Existing local customised projects should merge the changed sources and run `python install_historical_peak.py`, rather than replace their own rule CSVs. Read [UPDATE_6_0_12_KO.md](UPDATE_6_0_12_KO.md) and [PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md](PATCH_CHAT_UX_AND_HISTORICAL_PERCENT.md). Actual changes are listed in `PUBLICATION_6_0_12_FILES.json`. Live configuration and data are not included.


## Optional compositional generalization (6.1.0 review)

See [COMPOSITION.md](COMPOSITION.md) for the implemented frame, reviewed lexical/structural
composition, opt-in `off` / `shadow` / `guarded` modes, deployment files and verification.
Default mode is off. Financial calculations, Tableau permissions and custom HTML/CSS
are unchanged. Independent MiniLM parity has not been established.
