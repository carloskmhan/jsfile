# Migration from the MiniLM / rules v1 package

## Keep a separate deployment folder

Do not partially overwrite the old model app. Deploy this folder separately; otherwise an old Worker/service or cached HTML can still load a model. Preserve the old approved deployment for rollback. The new application does not invoke any old classifier/model files.

## Keep these data-contract values

Copy the original internal tableauUrl, approved classic apiUrl, worksheetName, filterField/filterBy and the four field names into the new tableau_config.txt. Keep its new command registry and confirmation settings. Update the name/alias catalogue to approved real records; sample names and synthetic balances are not a production source.

Tableau `json_data` remains the group wrapper with the same group IDs and entity/month records. This version validates the declared grain and requires explicit product/location detail for those reports. A single-group response is not treated as an authorised full portfolio. Broad queries are off by default.

## Remove from the deployment dependency graph

MiniLM models, tokenizer/model config, `rwa_classifier.txt`, learned `rwa_model.txt`, embedding caches, Transformers.js, ONNX runtime/model WASM and Python training are not copied into this package. The original MiniLM may be kept only in a separate approved development benchmark environment; it is not required by the bank webpage.

## Functional change: preview before execution

The user submits a command, reviews the calculated fields and clicks Run report. The app may already read authorized source data to establish the available scope before the preview. It does not calculate the financial report until confirmation. Preview tokens expire after 120 seconds and are invalidated by source changes/reset/cancel. This is a UI correctness safeguard, not a server access-control mechanism.

The low-level JavaScript engine remains callable for unit tests; do not regard a hidden button or a token in browser memory as a security boundary. Prevent unapproved data access on the server.

## New expression management

Use `commands_editor.html` to produce a reviewed new `command_patterns.txt`. A new expression must map to an already implemented command; it does not invent a new analysis. Normal web deployments reload the registry after refresh. The standalone synthetic HTML must be rebuilt separately with the optional validation packaging tool.

## Live-review lock

This build starts in synthetic sample mode. After documented bank review, set mode to tableau and liveReviewAcknowledged to true. Keep requireConfirmation true. This acknowledgement is not evidence of approval; maintain the real record in the bank's normal control system.

## Before release

Check server-side RLS within JSON arrays, SSO, actual SDK/network traffic, failure/truncation, multi-user behavior, CSP headers, unit conventions and attribution reconciliation. No old-data fallback is allowed when loading fails. Review supported Tableau API versions; preserving v2 is not a support endorsement.

Regressions and benchmarks are supplied in a separate validation package. Extract both package folders under the same parent to use the relative test paths. Do not publish benchmark outputs containing live bank questions or raw records.
