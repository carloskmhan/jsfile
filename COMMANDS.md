# Command registry maintenance

## 1. What a template does

A registry entry substitutes recognized parameter strings into a fixed command. It does not store an expected financial answer and does not train a model. Matching is case-insensitive after explicit Unicode/text normalization. Whole-input matching is required, with only the documented suffix clauses.

```json
{
  "id": "CUSTOM_1",
  "enabled": true,
  "questionPattern": "give me the movement report for {scope}",
  "canonicalPattern": "explain {scope}"
}
```

The output must be a command already understood by the fixed report catalogue. Reuse an existing canonicalPattern from the registry rather than inventing executable syntax. A structurally valid template can still have the wrong business meaning; reviewer testing is mandatory.

## 2. Supported parameter slots

| Slot | Values |
|---|---|
| `{scope}`, `{other_scope}` | Exact catalogue group/entity/ID/alias, or a documented existing-context reference |
| `{entity}` | Exact catalogue entity/alias or explicit ranked-entity reference |
| `{driver}` | Registered driver key or manually specified driver alias |
| `{dimension}` | Entity/group/product/location breakdown |
| `{movement}` | Fixed movement/balance vocabulary already enumerated by the parser |
| `{period}`, `{other_period}` | Explicit supported month or period syntax |
| `{n}` | Bounded integer or listed number word |

Every input slot must occur in the canonical output; invented output slots and repeated input slot names are rejected. Use `other_scope`/`other_period` for a second occurrence. Regex, SQL, JavaScript, unrestricted wildcard captures and arbitrary expressions are not supported. Runtime limits are 1,000 templates, 500 literal aliases, 300 characters per template, 1,000 characters per input; these are resource guardrails, not comprehensive DoS protection.

## 3. Phrase aliases

```json
{"from":"leaving out","to":"excluding"}
```

This is an exact phrase substitution with token boundaries, applied once. Output text cannot trigger another substitution chain. Catalogue names are shielded before phrase substitutions. No fuzzy/similarity match is used. Choose narrowly defined equivalents; do not equate credit deterioration with exposure growth or silently discard a word that changes an instruction.

Courtesy prefixes are similarly finite and manually enumerated. Missing content is not ignored. A template that fails in context must yield a clarification rather than an approximate route.

## 4. Fixed trailing clauses

Examples accepted when appropriate for the matched operation:

```text
top 3 entities for Samsung Group in June 2026 excluding FX
top entities by percentage increase
top entities above $100m
explain Samsung Group in June 2026 in one sentence
```

The parser consumes scope, period, exclusion, metric, threshold and style clauses as separately defined modifiers. Repeated/contradictory modifier kinds are rejected. Numeric thresholds apply to rankings, not arbitrary narrative analysis. Driver exclusions require explicit driver values, including zeros, on every selected row. Absence is not zero. A balance cannot be adjusted by subtracting a driver contribution as though that were a counterfactual balance.

An alias is not an instruction to disregard unsupported conditions. Test near-opposites: `excluding FX` versus `was FX the main driver`; `highest RWA` versus `largest RWA increase`; `amount` versus `percentage`; `June` versus `May`.

## 5. Existing-context shortcuts

`Which entity?`, `What drove that entity?`, `Exclude FX`, `And Samsung SDI?`, `Compare the two`, `Same for May` update only the fixed slots implemented in command_fields.js. They do not perform general pronoun resolution. Rank references require a prior successful ranked result. Multiple possible subjects are not resolved by probability. Visible selectors/source changes clear or invalidate pending scope as specified in the UI.

Every report is previewed again, including inherited conditions. A successful report updates the memory state. Cancel, failure, stale token or incomplete data does not create a successful new context.

## 6. Safe editing process

1. Open commands_editor.html from the same approved web origin. Import an existing registry if needed.
2. Add a question template and existing canonical command, or edit JSON in the advanced section. Use a new unique ID.
3. Disable replaced/conflicting templates. Validate and download the resulting `.txt` draft.
4. Test the intended expression and near-opposite/adversarial expressions. Check the complete preview, not just its action name.
5. Obtain normal code/data-tool change approval and deploy the versioned registry. Keep hashes and a rollback copy. A reviewer should approve the actual rule semantics, not only a successful JSON validation.

The editor does not authenticate approvers or deploy to a server. It does not record approval in a remote system. No automatic feedback learning or runtime self-modification occurs. `Save` means download a draft. In production, restrict who can host/replace this file using normal access/change controls.

## 7. Operations available

RWA movement breakdown, entity driver breakdown, largest attributed driver, driver amount, arithmetic driver contribution/main/sole checks, entity contribution, entity/group/product/location rankings, period or subject comparison, monthly movements, peak-month/balance lookup, offsets, attribution reconciliation and numeric entity concentration share.

New templates only expose these operations. New calculations require reviewed source changes and tests. Fields such as RoRWA/risk density, recommendations, forecasts and causal rating-event analysis are not implemented.
