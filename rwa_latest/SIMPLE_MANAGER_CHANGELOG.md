# Simple manager change record

## Baseline

The baseline is the current full connected v6 project, overlaid with the already-delivered SSO startup/large-batch sources, the `for` customer-name fix, and the main-contributor/comparison-note display patch. Those web and engine files are not changed by this manager add-on.

Inspected: `rule_manager.py`, `COMMANDS.md`, all seven current CSVs, compiler/schema and extensions, manager HTML/CSS/JS/test lab, semantic modules, relevant execution/provider interfaces and the original tests. `aliases.csv` was intentionally absent in connected v6; no alias master was reintroduced.

## Changed

- `rule_manager.py`: simple capability endpoints and optional CSV metadata transactions; old APIs, source protections and local-only serving retained.
- `local_manager/index.html`: simple English Home, Test engine and five-step wizard entry.
- `local_manager_tests/dom_fixture.py`: points original advanced UI test harness to the moved advanced HTML; original test assertions remain unchanged.
- `COMMANDS.md`, `LOCAL_RULE_MANAGER.md`, `MANAGER_BUILD_INFO.json`: documentation/build record for the simple interface.

## Added

- `capability_manager.py`: existing-operation catalogue, proposed changes, ownership/reference analysis, existing compiler invocation and guarded commit.
- `local_manager/simple.js`: shared Add/Edit/Fix wizard, Home/Search/Delete and friendly test screen.
- `local_manager/simple_logic.js`: real-parser proposal checks, readable interpretation and baseline/draft comparison. Not used by the production Q&A parser.
- `local_manager/simple.css`: layout, cards, wizard and responsive styling; no external fonts or libraries.
- `local_manager/advanced.html`: original editor moved intact, with a return link.
- `simple_manager_tests/`: backend, HTTP, browser workflow, helper and environment checks.
- `SIMPLE_RULE_MANAGER.md`, this change log and `simple_manager_reports/`: instructions and evidence.

## Created on first Save, not bundled as replacements

- `rules/capabilities.csv`
- `rules/capability_examples.csv`

They describe management cards/examples/dependency ownership only. Executable rule sources remain the existing seven CSVs. Shared core definitions are reused; only safe owned unused expression entries are collected automatically.

## Not changed

The seven executable CSVs, generated `command_patterns.txt`, `build_command_patterns.py`, its schema/validation helpers, all production `semantic/*.js`, `rwa_engine.js`, `rule_client.js`, `group_catalog.js`, Tableau provider/settings, main `demo.html`, startup/loading assets, existing advanced JS/CSS, and `test_lab.js` are byte-identical to the recorded baseline. See `source_preservation.json`.

No unknown-token allowance, fuzzy threshold, feature weight, grammar safety check or financial calculation was relaxed. All new sample runs are disposable test projects; none changes shipped user rules.
