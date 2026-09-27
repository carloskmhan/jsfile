# Tableau setup and deployment — v6

## Workbook / worksheets

1. Connect Tableau to the `tableau_data.csv` already built with your approved source mapping. Do not join it back onto repeated driver-level records, which would duplicate JSON cells.
2. Use STRING data type for `client_group_id`, `client_group_name`, `group_location`, and `json_data`. Preserve ID leading zeros. Validate the longest JSON cell survived ingestion; do not open and re-save huge JSON cells in Excel.
3. Create `RWA_GROUP_INDEX` from this same data source. Use group ID and group name as discrete dimensions (Rows or Detail). One mark/summary row per ID/name pair; no totals, RWA measures, Reporting Month or JSON. Both fields must be returned in `getSummaryDataAsync`, not merely used in a title.
4. Keep/create `RWA_DATA` with the four outer fields as dimensions. The whole `json_data` string must participate in the mark/detail data, not be shortened, parsed into a tooltip or aggregated into `ATTR(*)`. One complete outer row per group ID. The adapter validates count, exact IDs and JSON parseability.
5. Put BOTH worksheets into the dashboard URL embedded by the application. A sheet only present as a workbook tab is not enough for `dashboard.getWorksheets()`. Do not depend on an invisible/removed sheet remaining accessible. Layout the small index pane in a restrained way and test actual returned data.
6. Apply the application group-ID filter only to `RWA_DATA` (Apply to Worksheets → Selected Worksheets). Keep it off `RWA_GROUP_INDEX`, including dashboard filter actions. Security/data-source filters and RLS must apply to BOTH. Changing Samsung to Toyota must not remove Toyota from the index.
7. Publish using the existing authenticated Tableau environment. Validate names as confidential data too. Do not use a shared privileged session or put passwords/PATs in static JavaScript.

## Application config

Start from `tableau_config.txt` in this release; merge YOUR approved settings, do not copy sample data over bank data.

```json
{
  "mode": "tableau",
  "tableauUrl": "https://YOUR_TABLEAU_SERVER/views/YOUR_WORKBOOK/YOUR_DASHBOARD",
  "apiUrl": null,
  "catalogSource": "tableau",
  "catalogWorksheetName": "RWA_GROUP_INDEX",
  "catalogFields": {
    "id": "client_group_id",
    "name": "client_group_name"
  },
  "worksheetName": "RWA_DATA",
  "filterField": "client_group_id",
  "filterBy": "id",
  "fields": {
    "id": "client_group_id",
    "name": "client_group_name",
    "location": "group_location",
    "json": "json_data"
  },
  "unit": "USDm",
  "requireConfirmation": true,
  "liveReviewAcknowledged": false
}
```

This is a subset, not a replacement for the full config: preserve all limits/rules paths. `liveReviewAcknowledged` must be changed to true only after your normal internal review. `apiUrl: null` uses the Tableau host's classic `/javascripts/api/tableau-2.8.2.min.js`; alternatively reuse your already approved exact classic-script URL. This is NOT an ES module/CDN/ONNX URL. The SDK is loaded using a classic script tag as before. v2 is deprecated in official documentation; use is retained for compatibility, not an endorsement of continued vendor support. Any v3 migration requires separate testing.

Default threshold/amount unit is USDm because the builder converts declared USD source units to millions. `defaultReportingMonth` can explicitly anchor a current report month, otherwise the latest loaded month is used for new questions. Follow-ups use their existing report period. Never add API secrets to config.

## Startup/query checks in staging

- Initial network activity reads the SDK/dashboard and the two-field index, not all group JSON.
- `Explain <known_group_id> in July 2026`: preview shows this raw ID; read only the requested group's JSON, then Run report.
- `How about <second_group_id>?`: new data are read; month remains July. It must not reuse the first group's numerical result.
- Same display name with two IDs: name-only query asks for ID. An explicit-ID comparison returns separate panels even if display names are identical.
- Same client name with two LEIDs: show distinct entity rows; ID-based follow-up selects one LEID.
- A group unavailable to user A is not exposed in A's index and cannot be fetched by editing UI or request IDs; repeat with user B. This requires server enforcement, not browser filters.
- A change of authorised index or external Tableau filter invalidates preview/context. The Refresh index button performs a fresh read.
- Truncated index/data, missing field, `*` JSON, malformed text, unsupported dtype, or inaccessible group stops without fallback.
- Reported difference reconciles to dedup driver bridge as arithmetic ONLY when the builder derived previous RWA. Compare independently to approved source totals outside the app.

## 50,000+ rows

If raw driver rows exceed 50,000, the group index still contains only distinct groups. JSON is fetched one/two groups at a time. If distinct groups themselves exceed 50,000, index transport and in-memory indexing must be measured on the actual browser/server. The included 50,001-index test is a local mock, not Tableau network performance. v2 does not gain v3 pagination simply by raising `maxIndexRows`. An incomplete index is a stop condition; stage a reviewed filtered universe or implement an independently reviewed paginated/search API if server limits prevent complete summary reads.

## Official references

- Tableau JavaScript API v2 reference: https://help.tableau.com/current/api/js_api/en-us/JavaScriptAPI/js_api_ref.htm
- RLS and user filters: https://help.tableau.com/current/pro/desktop/en-us/publish_userfilters.htm
- Applying filters to selected worksheets: https://help.tableau.com/current/pro/desktop/en-us/filtering_global.htm

The application does not bypass frame restrictions, SSO, content security policy or RLS.
