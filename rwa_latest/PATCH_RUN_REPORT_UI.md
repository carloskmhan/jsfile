# Run report feedback, Group IDs and registered-phrase correction

Published as individual source files. The four runtime files are byte-identical to the incremental patches already delivered in the conversation:

- app.js: Run report shows an inline spinner and Running... while checking scope and calculating. Existing one-shot confirmation, stale-preview checks and error handling remain.
- loading_screen.css: legible pending-button state and reduced-motion support. Existing SSO splash and wave-dot styles remain.
- rwa_engine.js: group-ranking prose and tables include the supplied Group ID, including leading zeros. Ranking arithmetic and material warnings are unchanged.
- semantic/dictionary.js: the previously delivered registered multi-word expression correction, so take me through does not match a weak take customer-name fragment first. Exact IDs, full names and real ambiguities remain protected.

Deploy the three root-level files together; keep the dictionary correction under semantic/. Preserve your local rule CSVs, generated command_patterns.txt and Tableau configuration. No rule recompilation is required for these source patches. Restart rule_manager.py when testing its cached modules; refresh the web page after deployment.

The synthetic standalone_demo.html was regenerated from the same current modules. It is not a live Tableau demo. Customer screenshots, credentials, live CSV exports and internal URLs were not included in this update.

Publication validation: before/after SHA-256 checks against delivered sources, JavaScript syntax checks, existing compiler validation, generated-demo rebuild, and unchanged-file checks. Full regression suites and real bank Tableau/SSO were NOT rerun for this upload. Earlier test evidence remains historical.
