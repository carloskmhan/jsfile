# Clickable group and client choices — 1.0.0

Base: `bd8daab772a90b0d2e490c2a54ce7b2c5d24e456` (v6.3, `rwa_latest/`).

## Behaviour

Instead of a long `Specify one of: GROUP ...; ENTITY ...` sentence, the chat UI
shows a keyboard-accessible list of authorised identities. Each card shows:

- The full display name and whether it is a Group or Client / legal entity.
- The group ID or LEID, retained as a string (including zeros and suffixes).
- For a client, its parent group name and ID.

A click pins the selected type + ID + parent ID to that exact span of the original
question. It does not send the same ambiguous name again, create a persistent alias,
change the customer catalogue, or bypass report preview/confirmation. Analytical
wording, months, filters, exclusions and other name occurrences are kept. If a second
name occurrence is ambiguous, it receives its own selection. Up to eight distinct
selected spans are supported per request; every candidate remains accessible in pages
of eight, not silently truncated.

For a bare name immediately after a single-month `TOP_CLIENTS` result, selection
opens an explicit group/client RWA movement drill-down for that ranking month. The
UI records this as `Analyse Group/Client: ... · YYYY-MM`; it does not attempt to
replace the scope of a portfolio ranking. Ranking-only thresholds and candidate sets
are not carried into this separate movement report. Historical-peak drill-down dates
are not guessed. Full name-bearing analytical requests are not rewritten.

A bare unrecognised **literal name prefix** (at least three letters in the final
word) can also produce a list, even if there is only one candidate. This is not
fuzzy auto-correction: numeric IDs, financial keywords, dates and arbitrary unknown
words inside longer questions are not offered as replacement customer names. A
question with no safe candidate retains the existing clarification path.

Groups come from the freshly read authorised index. Legal clients are shown only
when their group details have already been loaded and their parent group is still
in the index. There is no portfolio-wide client scan. A uniquely named group can
produce a second choice list after its details reveal same-name legal clients.

## Safety and compatibility

The default dictionary, parser outputs, regression expectations, financial calculations,
CSV rules, Tableau provider and authorisation checks remain unchanged for requests
without an explicit `context.identitySelection`.

An explicit selection uses a temporary dictionary view. Its original normalised
question, exact offsets, typed ID and current catalogue membership are checked before
routing, after loading and at the existing preview/confirmation reparse. It cannot
swallow an unrelated name, number, date, driver or financial condition. Other wording
is not fuzzily rewritten after a selection; a remaining typo may require a new question.

The UI selection expires after two minutes and becomes inert when another question
is typed/submitted, context controls change, the source refreshes, or New chat is used.
A click refreshes the index and loads the selected authorised group(s) again. Removed
or renamed candidates are not silently substituted. The existing source-version and
one-shot Run report checks remain in place. Selecting a name alone never calculates
or commits successful conversation state. Candidate labels use DOM textContent, not HTML.

The earlier ordinary-chat `Checks:` hiding remains. Warning/evidence fields remain
intact. No screenshot, real customer IDs, bank amounts, credentials or live dataset
has been added to this release; all tests use synthetic identities and numbers.

## Deployment

No rule compilation, CSV migration or composition-mode change is needed. The picker
also works with `compositionMode: off`, because identity selection is not a new
financial/semantic capability. To opt out of the UI only, set `identityChoices: false`
in the existing configuration; the old clarification behaviour is then displayed.

Deploy the matching files under `rwa_latest/`:

```
app.js
identity_choice_ui.js
semantic/identity_selection.js
semantic/engine.js
semantic/lexical.js
semantic/routing.js
styles.css
```

Keep existing `demo.html`, `loading_screen.css` and `tableau_config.txt`. If styles.css
has local changes, append only the final `Request-local identity choices` CSS block.
For single-file deployment rebuild with `python tools/build_standalone.py` using local
configuration. The committed standalone uses the repository's synthetic demo config.
Refresh the browser after deploying the matching modules and styles.

## Verification

```
npm test
node tests/test_identity_selection.mjs
python tests/identity_selection_browser.py
```

The browser test additionally requires Playwright and Chromium. It exercises the
actual bundled application and sample provider, including group-index ambiguity,
new ambiguity after details load, portfolio -> name -> clicked drill-down, duplicate
client names, original period/exclusion retention, partial-name selection, pagination,
keyboard focus, mobile layout, cancellation, stale/expired selections, double click,
source invalidation, escaping and Checks suppression. No live bank Tableau/SSO UAT
or MiniLM benchmark is claimed. Existing 851 behaviour snapshots remain immutable.
