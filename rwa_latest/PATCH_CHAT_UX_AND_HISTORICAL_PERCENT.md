# Chat UX and historical monthly-percentage ranking

Source baseline: `carloskmhan/jsfile/rwa_latest`, commit
`bfd51962a6a760c0bafd161b0bdbc2c478a8bb00`.

This is an incremental patch for the full current project, not a standalone app.
There is no model, training, external service, new database, or new Tableau worksheet.
The actual bank screenshots/data supplied in the conversation are not included.

## Apply once in your full LOCAL project

1. Stop `rule_manager.py` with Ctrl+C. Back up the entire working project, including local rules and configuration. Work on a copy first.
2. Copy this patch's files/subfolders into that project. Keep every other file. Do not delete or replace the existing `rules/` directory. Preserve any local HTML/CSS customisations by merging them.
3. In that updated project run:

```bash
python install_historical_peak.py
```

The installer reads YOUR existing CSVs. It adds one reviewed historical-ranking command and its phrases, retains custom expressions (including `take me through`), adds a contradiction feature to protect old reports from the new intent, and invokes the existing compiler. It does not lower scores, fuzzy thresholds or safety limits. Existing back-up/revision-lock/transaction rollback mechanisms are used. Source files must have been copied first. Stop the old manager before running this, because the installer uses its project lock.

If validation fails, the installer leaves your working CSVs and generated artifact unchanged and explains the conflict; do not deploy the incomplete update. Backups are under `.rule_manager/backups/`. The CSV transaction does not magically make multi-file source deployment atomic; retain your full project backup.

4. Start the manager:

```bash
python rule_manager.py
```

Open `http://127.0.0.1:8765/`. The added built-in card is **Rank groups by historical monthly percentage peaks**. The default project now has 20 cards; local additions/deletions can change your count. The ordinary manager still requires only Python 3.10+ and a modern browser, not Node/pip/models.

5. For your separately hosted Q&A site deploy the updated runtime files listed in `FILES_CHANGED.json` **plus the new command_patterns.txt generated on your machine**. Keep your approved `tableau_config.txt`, `rules_config.txt`, dataset and SSO/API settings. Deploy the matching source and artifact together, then fully reload. Restart a running rule manager as it caches runtime modules.

Do not rerun `build_tableau_csv.py` merely to apply this patch. Your RWA data model and two worksheets are unchanged. To preview locally use the existing localhost server, e.g. `python -m http.server 8000 --bind 127.0.0.1` and open `/demo.html` on port 8000.

## UI changes

- Run report / Cancel share one flex action row and equal height, in both idle and running states. The existing Running... spinner is retained. Main styling is the appended `6.0.11-chat-ux` block in `loading_screen.css`.
- The submitted user question is scrolled into view immediately, before waiting for data. Output follows the end while you are reading the latest messages. Deliberately scrolling upward pauses following; **Latest message** resumes it. A new submitted question follows the latest again.
- Successful final text is progressively revealed. It is a display of already calculated text, not model streaming and not a change to execution. Previews and errors remain immediate. **Show full answer** skips the effect; reduced motion and hidden tabs receive the complete text immediately. Tables and folded notes appear after the prose finishes.
- Optional presentation settings in your existing config: `animateAnswers` (default true), `answerCharsPerSecond` (default 180), `answerMaxDurationMs` (default 5000). No setting is required. The duration is an upper bound, not a mandatory wait.
- Twenty example buttons appear on the left on a wide screen. Narrow screens use **Examples**. A click fills the composer but does not run anything; Send/Enter still uses the existing validation/confirmation. Group-specific examples use the selected system ID; without one, the engine asks. Months come from analysis context, not the wall clock. Labels/phrases live in `chat_examples.js`; editing this display list does NOT teach the parser new semantics.
- The long exact negative-derived-basis paragraph moves into folded **Calculation notes** for ordinary monetary reports. The source value and `.warnings` stay intact. Percentage and reconciliation reports retain relevant visible warnings. Missing-history/partial-ranking, unexplained residual and other material warnings are NOT blanket-hidden.
- Existing 5-second startup, SSO embedding/hiding, query wave dots, group IDs in results, name collision fixes and multiple driver reports are retained.

## What historical peak means in this report

For each group ID and each eligible month:

```
monthly amount = group RWA at month end - group RWA at previous month end
monthly percentage = monthly amount / previous-month group RWA
```

Highest: choose that group's maximum signed percentage, then rank groups descending.
Lowest: choose that group's minimum signed percentage, then rank groups ascending, including negative declines. Each group appears once. The displayed month and monetary amount belong to that same winning month, not the entire window. Rankings use unrounded values. Within a numeric tie the latest month is displayed, all tied months remain in details; group ties use stable IDs. A 0% or even a negative maximum can appear if that is a group's actual maximum in the chosen window; this is not an automatic positive-only filter.

**Previous balance basis:** use actual adjacent-month group closing totals when supplied. Otherwise use explicitly reported prior balances only. Rows flagged as builder-derived previous balances are never a fallback denominator for this new percentage report. If your builder provides May/June/July closing values and no independently observed April value, June and July can still be calculated; May cannot. A nonpositive previous total or unavailable month is excluded and counted, not replaced with zero or infinity. Missing months do not stop an otherwise complete download from supporting an explicitly labelled available-month ranking. Coverage tells you eligible groups/months and the incomplete portion; this is never presented as a peak over unobserved history.

Adjacent observed closing totals have priority consistently. If supplied reported openings disagree, the difference is warned about. Group totals reflect recorded membership each month, not a like-for-like fixed cohort. This balance-based month-on-month amount can differ from the existing deduplicated driver-attribution movement; the old reports and their arithmetic are not rewritten to match it.

`all history` means all available months through the current analysis reference month, within the existing configured history limit. It does not fetch periods absent from the authorised dataset or ignore a selected analysis end date. Complete authorised portfolio loading still precedes confirmation; existing batching, timeouts and row/byte guards remain.

## Example questions

```text
Show top 10 groups by highest monthly percentage change over all history
Show top 10 groups by lowest monthly percentage change over all history
Show top 10 groups by highest monthly percentage change from May to July
Top 5 groups by peak RWA increase over all history
```

The current output columns are Rank, Group ID, Group name, Peak month, MoM change (%), and RWA change (USDm). The example range resolves its year against the analysis context. Do not combine `all history` and a conflicting specific month in one question.

## Register your own wording with the card wizard

This report did not exist previously as a per-group historical percentage extremum. It required a new calculation function/grammar/compiler definition; a card alone could not safely create that arithmetic. After installing the reviewed extension the normal card wizard can attach new wording to it.

For example, in Add new capability or Fix interpretation:

1. Representative question: `Survey groups by highest monthly percentage change over all history`.
2. Choose **Rank groups by historical monthly percentage peaks** under the supported reports.
3. Choose the highest-monthly-percentage meaning; use the engine default number (this example supplies no N), and **All available history** (through the analysis reference month).
4. Check the examples, Review, and Save. The exact Survey example was tested with the current parser/compiler. No company names, dates or amounts are swallowed into the request phrase.
5. Test the corresponding lowest example separately; its explicit wording must stay lowest. A selection cannot silently relabel highest words as lowest.

Initial limits: the new report supports group exclusions and an explicit time window, but not driver/entity exclusions, threshold filters, mixed comparisons or ambiguous reference-followups. Unsupported modifiers fail closed. For a drilldown copy the displayed system ID and peak month into an explicit existing report, e.g. `Main driver for <ID> in <YYYY-MM>`; do not assume a historical peak's month automatically becomes the previous result's context.

## Verification

See `verification_summary.json` and `reports/chat_ux/`. Tests include real compiler/CSV migrations/rollback, percentage arithmetic and coverage, 20 examples, browser button geometry, immediate scrolling, typewriter completion, mobile, reduced motion, card Add/Edit/Delete, and unchanged legacy parse outputs. The 9,228-group test is synthetic local in-memory calculation only, not a Tableau benchmark.

Chromium localhost navigation in this environment was blocked by administrator policy. It was not bypassed. Browser evidence uses real application modules in in-memory HTML plus synthetic data and test-only delay/failure hooks; actual Python localhost HTTP was checked separately. Bank SSO/Tableau/UAT was not run. The old full runner still has its pre-existing single builder display-string assertion that expects a long comparison note intentionally removed by a previous release; it was not weakened or called green here.

Reusable checks after installation:

```bash
python build_command_patterns.py --check
node tests/peak_chat_checks.mjs
python tests/test_peak_installation.py -q
python tests/chat_ux_browser.py
python tests/history_manager_browser.py
```

Developer browser automation requires an existing approved Playwright/Chromium installation. Runtime/normal manager do not. The test-only `tests/fixtures/pre_historical_peak/` folder contains original synthetic rules for migration tests and is NOT a replacement for your live rules.

This document originated with the downloadable patch. The expanded source is now included in this repository; see reports/publication_6_0_12.json for publication-only checks. Publishing source is not automatic bank deployment.
