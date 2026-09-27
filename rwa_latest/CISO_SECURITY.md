# Security and governance review — v6

This release uses manually defined rules and ordinary numerical calculations. It contains no learned model runtime or external AI service. Non-ML does NOT guarantee a non-AI classification. Development involved ChatGPT; development-tool policy and runtime policy are separate. Obtain bank classification and normal secure-development approval for the actual code, purpose and data flows.

## Data boundaries
- Language artifacts contain no customer alias master. Names/IDs come only from the authenticated Tableau index in live mode. No public/static/sample fallback is allowed after a Tableau failure.
- Index and RWA_DATA need server-side authorization/RLS. Browser filters, signatures and allowlists are not authorization. Restrict every entity inside JSON before it is delivered; an allowed group row exposes the whole cell.
- Only the selected group IDs are read for ordinary reports. Portfolio loading is separately enabled and bounded, not an implicit clear-all security filter operation.
- Data/session metadata remain in JavaScript memory. No localStorage, indexedDB, telemetry, chat API or automatic question logging is added. The user can still copy/screenshot visible data; browser access itself cannot prevent that.
- Source events invalidate in-flight requests and previews. Index rereads detect changes but cannot prove arbitrary server rights are unchanged where the index remains identical. Two-minute confirmed snapshot processing is not a server-side authorization transaction. Revoke/login/session policy must be enforced in Tableau.

## Platform controls
Use approved HTTPS static hosting, CSP headers (including frame-ancestors as appropriate), correct JS MIME types, SSO and allowed Tableau/IdP origins. Meta CSP in bootstrap is only one application control and does not replace server review. v2 classic SDK comes from the configured approved host; review its supported version and dependencies. Never add secrets to config. No bypass of iframe/CORS/SSO/security policy is provided.

Validate actual response completeness and longest JSON sizes. Invalid JSON, wrong/duplicate IDs and reported truncation abort. Source omissions with no truncation flag must be caught by data population checks. Freeze rules and source for UAT, review negative tests and dependency/source hashes; hashes alone do not establish trust.

Derived previous RWA is a comparison basis built from drivers, not independently observed history. Do not treat arithmetic reconciliation as independent financial verification. New driver families are used only if explicitly supplied by an approved source.

The local manager is a single-user development tool, not a shared production web server. Keep real data out of synthetic sample assets, do not publish the full source/test directory, and protect local backups. Approval flags are acknowledgements, not authenticated workflow approvals.

Not completed: real bank Tableau/SSO/RLS, penetration test, security certification, official non-AI classification, independent accuracy/holdout evaluation, production memory/network sizing.
