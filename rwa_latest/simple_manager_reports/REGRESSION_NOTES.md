# Regression notes

The same eight original suites were run against (1) the preserved latest incremental baseline and (2) the manager-only update. Seven pass in both. No new suite failure was introduced.

The unchanged builder integration script stops on its assertion that normal answer prose contains `NOT an independently observed`. The user's earlier comparison-note display patch deliberately hides that recurring prose. This same engine file is byte-identical in both trees. The warning remains in structured metadata. The failure was not suppressed and the old expected text was not changed to manufacture a pass. This release does **not** claim that the entire original runner exits successfully.

Both actual raw runner outputs are retained in `baseline_regression.log` and `current_regression.log`. The prior 626-question and 225-question corpora still pass (851/851). They are known developer regression data, not blind generalisation evidence.

The manager workflow itself was tested through actual loopback HTTP and separately through real browser JavaScript + real compiler/transactions using a test-only in-memory binding. A genuine browser localhost navigation attempt was blocked by the environment's policy. It was not bypassed or described as a successful browser-HTTP workflow.

During development, the UI's suggested highest-balance wording was corrected to an expression the existing parser represents unambiguously (`higher RWA balance`). AUTO direction is now displayed as automatic and is not accepted as a guarantee of highest-first ordering in a capability profile. Unknown customer-like text is not converted into an action synonym. These are manager-side checks; the engine/parser/thresholds are unchanged.
