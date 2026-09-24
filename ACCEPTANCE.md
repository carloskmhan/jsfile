# Bank acceptance checklist — complete outside the application

Status of this delivery: **review build; live approval unknown**.

## Decision record to maintain in the bank's approved system

- Intended use, users, data scope and deployment location.
- Classification under the actual bank AI/model/analytics/EUC and AI-assisted-development policies.
- Reviewer decision, conditions and approval record reference; no blanket exemption assumed.
- Approved code/registry hashes, Tableau SDK version, owner, support plan and rollback version.

## Functional acceptance

Freeze the proposed code/registry; use an independently authored set of actual English RWA requests. Include exact groups/entities, explicit/default periods, near-opposite wording, unknown names, aliases shared by different entities, net-zero/negative/offset situations, incomplete attribution, multiple grain rows and real multi-turn changes. Validate the entire displayed plan, not just the operation name. Test the added confirmation step for usability and accidental execution.

For the MiniLM comparison, give both implementations equal source scope and context. Report the frozen original package and any newly enhanced model-based comparator separately. Count proper clarifications and wrong executed answers separately, and do not count missing old features as evidence about embedding quality. Developer fixtures are regression tests only.

## Operational acceptance

Run actual HTTP/SharePoint deployment, Tableau SDK loading, SSO, CSP/frame headers, low-privilege RLS/JSON scope, failed/truncated loads, race conditions, filter changes and data refresh tests. Confirm all browser-visible data is authorized. Review network traces and exact dependencies. No synthetic smoke test substitutes for these checks.

## Expression changes

Review both template and canonical instruction. Require slot preservation and tests for close opposite expressions. Deploy an approved registry through normal version/change control. The editor only downloads a draft and does not provide real approval, authentication or promotion workflow.

Only after these decisions and checks, an authorised maintainer may set liveReviewAcknowledged=true in the reviewed deployment. The flag is not evidence that these tasks were completed.


## v3 dialogue/application regression
Developer-authored chained and compound RWA cases: new fixed-command engine 61/61; frozen original MiniLM application 23/61 on the same expected command fields. This is not blind independent validation and does not isolate embedding quality.
