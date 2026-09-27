# RWA Capabilities — simple local rule management

**2.0.0-simple-review · English interface · add-on for the current connected v6 project**

This is a new management interface over the existing v5-family CSV semantics and the current v6 compiler/parser. It is not a new Q&A engine, a learned model, a new customer master, or a bank deployment approval.

## Start

Use the **full source project**, not just the web-deployment subset. Stop an existing manager first and back up the working folder. Extract the add-on into the directory containing `rule_manager.py` and `build_command_patterns.py`, keeping subdirectories. Do not replace your Tableau settings, source CSVs or deployed web runtime with sample files.

```bash
python rule_manager.py
```

On systems using that executable name:

```bash
python3 rule_manager.py
```

Open `http://127.0.0.1:8765/`. The browser normally opens automatically. Stop with Ctrl+C. The existing Windows `start_rule_manager.bat` remains usable. For a different port: `python rule_manager.py --port 8766`. The existing `--project` and `--no-open` arguments are preserved.

Python 3.10+ standard library and a modern JavaScript-enabled browser are sufficient for ordinary management. No Node, Flask, pip installation, model download or external AI service is required to run the manager. Test automation is separate.

## Everyday use

**Home:** Search capability names or example questions. Select **Add new capability**, **Edit**, **Delete**, or **Test engine**. The initial cards are derived from enabled commands and supported follow-up operations in the current project. They are not a claim that every possible English question is supported.

**Add / Edit:** The same five-step wizard asks for a representative question, an existing report meaning, relevant details, example expressions and a final review. It creates or reuses the required existing synonym/follow-up entries, compiles a draft with the original compiler, then checks the examples with the real browser parser. Saving is enabled only when the normal wizard checks pass. The ordinary interface never asks for grammar IDs, feature weights, slots or CSV dependencies.

Example: enter `Take me through Samsung's RWA movement in July`, choose **Explain RWA movement**, and keep **As stated in the question**. The unfamiliar request phrase can be connected to the existing movement report. The customer and date remain separately parsed values, not part of a company-specific answer template.

**Edit details:** To change an increase ranking to a balance ranking, change the measure and update the example wording. Use the suggested wording where useful. A question explicitly saying “increase” cannot silently be relabelled “balance”. Existing known meanings are protected. The Review page shows the actual parser result, not just the selection made in the wizard.

**Delete:** One confirmation triggers dependency analysis, compilation and checks. Only unused entries created by this manager are automatically cleaned up. Pre-existing, shared, or manually altered entries are preserved. Removing a custom card does not globally ban every equivalent question if existing rules still support that meaning. Removing a built-in command disables it only when no saved capability shares it; otherwise the shared command is retained and the notice explains that distinction. A backup retains the previous source files.

**Test engine:** Enter a question to see Report, Target, Measure, Order, Number, Period and relevant exclusions, without raw JSON or scores. Test context uses a local group and a reporting month with data. **Looks right** runs the local sample calculation and commits that successful test context for a follow-up; it does not learn or save rules. Missing sample data can still stop a calculation after successful interpretation.

**Fix interpretation:** Opens the same wizard with the failed or misinterpreted question. Choose the intended supported report and optionally add the expression to an existing capability. Conflicts offer **Edit examples** or **Use suggested wording**. Selecting a meaning is not permission to bypass the compiler, discard unknown modifiers or change the meaning of a name, date or amount.

## What is and is not automated

The manager chooses existing command/feature/patch definitions, creates literal request-expression synonyms or finite typed follow-up patterns, tracks ownership and shared references, validates drafts, checks interpretations, backs up sources and publishes a new generated artifact. It does not invent calculations, new semantic categories, unsupported grammar, forecasts, hidden defaults or missing source data.

The initial implementation deliberately accepts one safely isolated **new request-prefix phrase** per example. Several disconnected unfamiliar phrases, ambiguous names, new financial concepts or unknown words after an existing command may require a clearer example or developer review. An unknown customer name is not added as a report synonym.

The selected measure, number and period are review expectations for the examples, not a hidden override of whatever a future question says. Numbers and periods are still extracted by the existing parser. The shared default number is read from `settings.csv` and is not silently changed for other reports. Automatic direction is displayed as automatic, rather than misrepresented as guaranteed highest-first ordering. These boundaries preserve the current runtime semantics.

## CSV remains the source of truth

Executable language rules remain the existing seven files:

```text
rules/commands.csv
rules/synonyms.csv
rules/followups.csv
rules/settings.csv
rules/fuzzy_config.csv
rules/temporal.csv
rules/units.csv
    -> existing build_command_patterns.py
    -> generated command_patterns.txt
```

The first saved capability change creates two optional **local management CSVs**:

```text
rules/capabilities.csv         # card name, supported report reference, review choices
rules/capability_examples.csv  # example questions and expression ownership/references
```

These are not a separate database or another executable command language. The original compiler does not consume them; the browser Q&A runtime does not load them. They are versioned, revision-checked and backed up with the executable CSV sources. Do not distribute examples containing sensitive customer information without the usual review. The add-on does not ship replacements for your existing CSV files, and simply opening Home does not rewrite rules.

The current project intentionally has **no `aliases.csv`**. Customer names/IDs continue to come from Tableau at runtime. The manager's local tests use the existing local data fixtures; they do not connect to bank Tableau/SSO or validate live row-level permissions.

## Save, protection and deployment

```text
Wizard choices and examples
 -> safe changes to existing CSV entries in memory
 -> original compiler, in a temporary folder
 -> real-parser example/known-control checks in the browser
 -> explicit Save
 -> existing transaction backup / revision check
 -> CSV publication and command_patterns.txt last
```

Compile failure or stale revision leaves the working files intact. Per-file replacements are atomic; multi-file publication uses the retained journal/rollback procedure and is not one OS-atomic transaction. A failed injected write was tested. Do not edit the CSVs in Excel while saving through the manager.

The browser's check token binds a review confirmation to a draft hash; it does **not** make the browser trusted or authenticate a bank approval. The original server-side compiler, path restrictions, loopback binding, Host/Origin/CSRF checks and normal filesystem access remain the controls. This is a single-user localhost authoring tool, not a network production service.

**Save updates local sources and `command_patterns.txt`. It does not upload to the bank website or rebuild a standalone demo.** Use the existing approved deployment procedure for the generated file. No runtime JavaScript patch is needed for ordinary supported expression changes.

## Advanced is retained

Open **Advanced** at `http://127.0.0.1:8765/advanced`. The former seven-table editor, CSV import/export, raw draft validation, detailed test output, local test-data import, backups/restore and artifact download are preserved. These do not have to be visited for normal Add/Edit/Delete workflows. Original advanced editor scripts and test-lab code are unchanged; their HTML entry is moved to `local_manager/advanced.html`.

## Tests and limits

Standard-library tests:

```bash
python -m unittest simple_manager_tests.test_capabilities -v
python simple_manager_tests/http_workflow.py
python -m unittest local_manager_tests.test_manager -v
```

Optional developer browser tests require the already approved Playwright/Chromium setup:

```bash
python simple_manager_tests/browser_workflow.py
python simple_manager_tests/browser_logic.py
python local_manager_tests/browser_dom.py
python simple_manager_tests/browser_http_attempt.py
```

The original `node tests/run_all.mjs` is unchanged. See `simple_manager_reports/SUMMARY.json` and `REGRESSION_NOTES.md` for measured results and the inherited stale warning-text assertion.

Real localhost HTTP was tested with a running `rule_manager.py` process. Actual Chromium localhost navigation was also attempted and returned `ERR_BLOCKED_BY_ADMINISTRATOR`; no browser policy was bypassed. Browser workflow evidence uses the real JavaScript and existing parser with a test-only direct binding to real Python compiler/transaction methods on disposable copies. That is not a full browser-over-HTTP validation, bank SSO test, penetration test, blind accuracy measure or five-minute usability study. Validate the real browser workflow on the approved local machine before wider use.
