# RWA Reports — Tableau runtime catalog edition

**6.0.0-review — integrated extension of v5.0.2, not a new application**

The English chat UI, 5-second title/wave-dots splash and slide-up transition, preview/confirm workflow, CSV rule compiler and deterministic RWA arithmetic are retained. There is no deployed MiniLM, LLM, trained embedding, ONNX, model WASM or external AI service. This does not establish a non-AI governance classification or bank production approval.

## 1. The two worksheets

Both worksheets must be present in the SAME active dashboard embedded by `tableauUrl`, using the same approved data source and server-side row-level security.

| Worksheet | Required fields | Purpose |
|---|---|---|
| `RWA_GROUP_INDEX` | `client_group_id`, `client_group_name` | Available customer name/ID lookup only; no financial JSON. |
| `RWA_DATA` | `client_group_id`, `client_group_name`, `group_location`, `json_data` | Complete builder output, one outer row per system group ID. |

Initialisation reads the index only. An accepted target lookup applies the exact group ID(s) to `RWA_DATA`, reads the complete JSON, and invokes the existing parser and arithmetic. The index is refreshed before questions and rechecked after detailed reads and before confirmation. A changed/partial index invalidates pending analysis rather than using a static list.

The app's `client_group_id` selection filter must apply to **RWA_DATA only**, not RWA_GROUP_INDEX. Never remove or weaken server-side RLS. The index is the available ID set, not an independent authorization system. A user receiving one JSON cell can inspect every client inside it: generate each cell within the correct entitlement boundary.

See **TABLEAU_SETUP.md** for exact worksheet and configuration instructions.

## 2. Start / configure

Default `tableau_config.txt` is **sample** mode, with live review acknowledgement false. Sample mode derives names/IDs from the supplied synthetic `tableau_sample.csv`; it also does not read aliases.csv or a static catalog file.

For local preview (approved development machine):

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/demo.html`. The full source directory contains development assets; never expose this development server or full source directory as a shared production service. An optional `node serve.mjs` server remains available. `demo.html` uses ES modules/fetch and is not a file:// page. `standalone_demo.html` is a separate synthetic, self-contained demo; it does not connect to live Tableau.

For live staging, merge your approved URL, API URL, worksheet and column mapping into `tableau_config.txt`. Set `mode: tableau` and, only after internal review, `liveReviewAcknowledged: true`. The flag is an acknowledgement, not an authorization mechanism. `tableau_config.live.example.txt` lists the complete proposed settings but remains review-locked. No credentials belong in any distributed file.

## 3. IDs, duplicate names and lookup

Group identity is `client_group_id`; client identity is `(client_group_id, LEID)`. Distinct IDs with identical names stay separate in filters, grouping, comparisons, rankings and conversation references. Name-only ambiguous requests ask for an ID. The group selector shows `Name [ID]`, and exact IDs are accepted in questions. IDs must be exported as strings; leading zeros cannot be recovered after a source export has removed them.

The runtime creates deterministic spelling variants from authorized names (full name, corporate-suffix shortening and meaningful name tokens). It does not invent acronyms such as SEC. Exact names and IDs precede bounded typo recovery; collisions are not arbitrarily selected. The customer list is held in memory, not compiled into rules or saved to browser persistent storage.

The two-column index contains groups, not every global LEID. Entity names/LEIDs become available after the parent group's detailed JSON is loaded. To ask about a client whose group has not yet been loaded, specify/select its group ID first. A global entity directory would require a separately authorized lookup, not scanning all financial JSON.

## 4. Builder v1.0.8 compatibility — important accounting basis

Use the already generated `tableau_data.csv` from your working builder. A byte-identical copy of the v1.0.8 builder is included under `data_builder/` for reproducibility; its mapping is an EXAMPLE, not a replacement for your own working mapping.

The builder de-duplicates exact `(detail_driver, impact)` pairs within group/LEID/month and adds distinct pairs. The web app uses the resulting amounts; it does not re-deduplicate by name or sum repeated current snapshots.

The builder deliberately ignores raw prev_* values and calculates:

```text
rwa_prev = rwa_curr - sum(unique reported driver impacts)
```

The web adapter now retains `attributes.rwa_prev_source`. Such a value is labelled **derived comparison-basis previous RWA**, NOT an independently observed prior-month balance. Zero reconciliation residual follows algebraically from its construction and is not independent verification. Percentage movement uses that basis, not necessarily last month's official balance; it is unavailable for a non-positive aggregate basis. These qualifications remain in responses, including concise answers and comparisons. Actual prior-month official balances require a separate agreed data definition.

Current CG/EAD/Scorecard attributes are preserved, but this release does not add new general attribute-question intents. Raw previous CG/EAD/Scorecard cannot be reconstructed. Missing months do not become zero. The synthetic Toyota August request resolves its period but correctly reports unavailable data.

## 5. Dynamic detail drivers

All complete detail labels in the freshly authorized JSON can participate in arithmetic and exact named-driver queries, without editing the language CSVs. Multi-word labels are protected from internal words such as 'increase', 'lower' or numbers becoming modifiers.

```text
How much came from EAD Increase (STD)?
Explain CG0001 in July excluding Maturity Increase
```

There is **no automatic economic/family classification** by name prefix. An optional explicit `driver_groups` map, for example `{"EAD Increase (STD)":"EAD"}`, can be supplied in the JSON to support family amount/exclusion queries. Full mapping coverage is required for family reporting; parent amounts must NOT also appear as monetary leaves. The unmodified builder does not create this optional map. Family main/sole-driver checks remain unsupported; use an exact detail label. Missing driver amounts are unknown, not zero; exclusions/amounts require explicit values on all selected rows.

## 6. Rule maintenance — seven CSVs

`rules/commands.csv`, `synonyms.csv`, `followups.csv`, `settings.csv`, `fuzzy_config.csv`, `units.csv`, `temporal.csv` remain the canonical language-rule source. **There is no customer aliases.csv in this edition.** A populated legacy alias file blocks command-line compilation with a migration message rather than silently publishing customer names.

```bash
python build_command_patterns.py
python build_command_patterns.py --check
python rule_manager.py
```

The local English workbench still supports CRUD, draft compilation, real-engine question tests, explicit save, backups and restore. Its Aliases menu is removed. Local test identities come from the local test CSV, not live Tableau. Same-name groups are shown with IDs. The workbench does not upload artifacts to a bank website or automatically rewrite the standalone demo.

The compiled artifact remains JSON-compatible text with an auto-generated header and empty aliases array. `identitySource: runtime_catalog` is mandatory in web bootstrap. The low-level numeric schema version remains 5 for compatibility; `engineVersion` is 6. Do not mix a v5 customer-bearing artifact with v6 web sources.

## 7. Capacity, integrity and limits

- `maxIndexRows: 100000` guards returned index rows. Detail rows/JSON are NOT loaded merely to resolve names.
- The group dropdown renders at most 200 matches; search the full loaded index by ID/name. The parser sees the full index.
- `maxPortfolioGroups: 500` and `allowPortfolioQueries: false` default guard full portfolio analysis. Two-group comparison is not a portfolio-wide read.
- `maxDataRows: 100000`, `maxJsonBytes: 5000000` (per group), `maxTotalJsonBytes: 30000000` are explicit detail limits. Request size uses UTF-8 bytes.
- A row-count mismatch, truncation flag, malformed JSON, incorrect returned ID, duplicate outer ID or missing requested group aborts. Nothing is presented as a complete portfolio after truncation.
- v2 `maxRows: 0` requests all summary rows, but is not a guarantee that the server returned all authorized records. The app cannot detect rows silently omitted by a source filter with no server flag; validate the worksheet population upstream.
- The bounded fuzzy implementation refuses too-large candidate pools and asks for exact names/IDs. A 50k+ index does not imply unlimited fuzzy search or production response-time guarantees.
- Every data filter/read is serialized. Source events invalidate state even while busy. A timed-out provider is poisoned until page reload; late data are discarded.

## 8. Validation and reproducibility

```bash
node tests/run_all.mjs
python tests/test_builder_integration.py
python -m unittest local_manager_tests.test_manager -q
python tests/browser_connected.py          # requires local Playwright/Chromium
python tests/browser_tableau_mock.py       # synthetic mock, not real Tableau
python local_manager_tests/browser_dom.py  # same
```

See `reports/release_summary.json`. All supplied corpora are developer-known regression/synthetic tests, not blind user acceptance, security certification or new MiniLM benchmarks. Original baseline comparison tools are preserved for development only; no original model is downloaded/bundled and no new A/B run is claimed by this release.

Real bank Tableau, SSO, permissions, server CSP/iframe policy, actual HTTP ESM loading and source truncation must be validated in staging. Local browser HTTP navigation in this environment was blocked by administrator policy; it was not bypassed. Browser evidence is in-memory DOM with sample/mock data, while Python HTTP tests separately check the local workbench.
