# Tableau sign-in inside the startup screen

Version: 6.0.5-signin-review. UI/lifecycle patch on the latest v6 incremental sources.

## Install

Back up your existing files. Replace **all six files** in the directory containing
`demo.html`, preserving any approved local UI customisations:

- `demo.html`
- `loading_screen.css`
- `loading_screen.js`
- `bootstrap.js`
- `app.js`
- `tableau_adapter.js`

Keep the existing `tableau_config.txt`, RWA/CSV builder, rules, data, semantic modules,
`group_catalog.js`, `rule_client.js`, styles and bank URL/SSO configuration. Do not
replace them with sample settings. Save source files as UTF-8. Reload the full page
(and verify the served versions when browser/static-server caching is used).
No rule compilation and no new Tableau worksheet is required.

The adapter in this patch is based on the latest large-batch revision: up to
10,000 IDs per configured batch, >5,000-value verification handling, per-API,
per-batch and total budgets, serial queries, progress and completeness checks
are preserved. The app is based on the timeout/progress revision with query wave dots.

Optional configuration (already the default in this patch):

```json
"tableauSignInTimeoutMs": 600000
```

This is the maximum wait for the initial Tableau view to become interactive,
including human sign-in. It is **not** the duration of every query, is not an
SSO session lifetime, and does not make authentication complete. Allowed values
are integers from 1,000 to 1,800,000 milliseconds. Existing SDK/per-API/batch/
portfolio timeouts remain separate and unchanged.

## Behaviour

1. The title and existing three wave dots appear at page startup.
2. In live mode, the actual Tableau iframe is created once inside the startup
   panel. It is outside the inert chat area, so the user's Sign In click and
   keyboard interaction reach Tableau. The application does not implement its
   own username/password form, inspect the cross-origin iframe, store tokens,
   or simulate a click on the vendor's Sign In button.
3. Completion requires `Viz.onFirstInteractive`, the two existing worksheets,
   a successful complete group-index read/validation, and completion of the
   application initialisation. A click, iframe load, elapsed timer, or generic
   `settled` event does not mark the app ready.
4. The existing minimum **five seconds from splash mount** remains. Once ready,
   the remaining hold elapses, then the existing 720ms slide-up / 480ms main
   opacity transition runs. If sign-in takes longer than five seconds there is
   no extra fixed five-second wait after it completes.
5. After the transition, the cover and panel are hidden (`hidden` / CSS
   `display:none`) and `viz.hide()` is used when present. The iframe is NOT
   removed, reparented, recreated or disposed for this presentation transition.
   The same provider serves later reads. There is no Connected Tableau view
   section in the normal chat.
6. A startup error remains on the cover with Reload and try again; chat is not
   enabled. The old 45-second splash watchdog no longer hides the sign-in UI.
   It only offers a reload when startup is taking a long time. The new separate
   initial-view timeout remains finite and rejects late initialisation results.
7. A later live request failure reveals a Reconnect to Tableau (reload page)
   control under Optional context & data. That is an explicit page reload;
   there is no automatic privileged re-login or stale answer reuse. New chat
   alone does not recreate the iframe or restart the splash.
8. Sample mode still uses local synthetic data and does not show a login panel.

## Security and deployment boundaries

- Hiding a visualisation is presentation, not access control, sign-out, or
  removal of sensitive data from browser memory. Existing server-side RLS and
  entitlement checks remain mandatory.
- Tableau and the identity provider continue to own SSO. This patch does not
  bypass iframe/CSP, cookie or popup restrictions. If the approved SSO flow
  opens a separate window/tab, complete it normally and wait for Tableau to
  return to the interactive state. The app cannot inspect third-party login DOM.
- Do not loosen CSP/frame-ancestors or browser policy to make the test work.
  Keep approved origin allowlists. Real IdP redirects must fit the existing
  deployment's allowed embedding/authentication configuration.
- `onFirstInteractive` is an API readiness event, not a cryptographic proof of
  authentication. Server-side view/data access is still authoritative.
- Session expiry is still possible; hiding the iframe does not extend a session.
- No new AI service, ML model, external runtime or password capture was added.
- The source development used AI assistance. This is not bank deployment approval.

## Test evidence

`verification_summary.json` records actual checks. The new browser tests use a
clearly-labelled synthetic Tableau iframe and test the user's click, delayed
readiness, hidden same-frame queries, error handling, reduced motion and mobile
layout. They do **not** execute bank SSO or the real Tableau SDK. A virtual clock
is used for the slow initialisation timeout scenarios.

A local HTTP browser navigation was attempted and returned
`ERR_BLOCKED_BY_ADMINISTRATOR`; the policy was not bypassed. The in-memory DOM
checks do not establish production module loading, server CSP, SSO or hidden-viz
API compatibility in the bank's version. Validate those in staging before use.

The screenshot contains a synthetic sign-in test, not the bank's real login UI.

## Official API references

- Tableau v2 API reference (`Viz`, `show`/`hide`, `dispose`, `onFirstInteractive`):
  https://help.tableau.com/current/api/js_api/en-us/JavaScriptAPI/js_api_ref.htm
- Tableau v2 authentication/session behaviour:
  https://help.tableau.com/current/api/js_api/en-us/JavaScriptAPI/js_api_concepts_authentication.htm

The deprecated v2 API is kept for compatibility with the existing project; this
patch does not migrate to v3 or introduce connected-app credentials.
