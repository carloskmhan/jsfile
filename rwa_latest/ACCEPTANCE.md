# Staging acceptance checklist

- Both exact-named worksheets exist inside the active embedded dashboard.
- IDs are strings; same-name different-ID groups/LEIDs remain separate.
- RLS applies to the index AND every nested data row before JSON delivery; test at least two users and an unauthorized ID.
- App current-group filtering applies only to RWA_DATA. Index still exposes the user's other permitted groups.
- Verify index and detail completeness, count totals and maximum JSON against source, including >50k raw rows.
- Test full name, raw ID, ambiguous display, typo, two-group comparison, client drill-down, July → other group → August, cancellation and stale/scope changes.
- Exact new detail driver labels work without rule rebuild; unsupported families do not acquire fabricated values.
- Derived prior-balance basis and algebraic reconciliation qualifiers are visible and business-approved.
- Do not certify observed prior-month balances from the derived bridge. Independently verify financial totals upstream.
- Run code/compiler/tests and bank HTTP/ESM/CSP/SSO/iframe checks. Local DOM/mock tests are not sufficient for production release.
- Validate cold/warm load time and browser memory on target computers; included local timings are not bank performance commitments.
- Preserve approved settings and rollback artifacts; no real CSV/sample/debug data in the public web directory.

The engine still refuses unsupported forecasts, arbitrary code/queries, unavailable periods and unsafe partial data. Runtime has no learned model; bank governance classification remains external.
