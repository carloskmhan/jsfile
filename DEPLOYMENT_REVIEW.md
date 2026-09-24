# Deployment and classification review

**Status: review build. No governance exemption, legal opinion or security certification is asserted.**

## Proposed factual description

> This browser reporting tool maps a finite, explicitly maintained command catalogue and typed parameters to predefined historical RWA calculations. It presents the requested calculation fields for user confirmation and fills fixed report templates from recorded data. The deployed application contains no machine-learning models, pretrained weights, embeddings, learned classifier, automatic rule learning or external AI service. The bank must classify the actual implementation and development process under its policies before deployment.

## Actual scope restrictions

The input path is a whole-command template matcher and explicit field parser. It has exact catalogue lookups, finite literal phrase substitutions, fixed time arithmetic, fixed state-update commands and a finite calculation switch. It does not contain an ontology, theorem prover, rule-chaining/knowledge-inference engine, vector search, fitted parameters, probabilistic intent selection, generated SQL/JavaScript or an agent planner.

A default action cannot be selected when no entire registered command matches. Unknown or conflicting content stops the request. The UI displays command ID, period, group/entity, dimension, metric, requested driver, exclusions, limits/thresholds and an audit trace. Users must confirm the report. Instructions are not allowed to add new code or data-processing functions at runtime.

Reports are descriptive arithmetic: sums, differences, ratios, sorting, ranking, period comparison and attribution residual checks. The app does not predict future RWA, make credit/trading decisions, recommend optimisation, derive reasons for a credit downgrade, or label numerical concentration as a risk grade. `CG impact` means recorded attribution, not an independently established causal explanation.

The deployment contains an editable template registry, but changes require external human review and controlled file deployment. There is no learning from user feedback. A literal expression registry is not a trained model; this alone does not establish a legal classification.

## Why classification still needs review

The [European Commission Guidelines dated 29 July 2025](https://ai-act-service-desk.ec.europa.eu/sites/default/files/2025-08/commission_guidelines_on_the_definition_of_an_artificial_intelligence_system_established_by_regulation_eu_20241689_ai_actenglish_nf2skcqfrtjdfggjavcodopcwz4_112455.PDF) distinguish logic/knowledge-based inference, including some grammatical/semantic language processing (paragraph 39), from basic fixed data processing and descriptive reporting (paragraphs 46–47). Paragraphs 6–7 require case-specific assessment and describe the guidelines as nonbinding. A confirmation button or different product name does not itself decide this boundary. EU guidance is supplied as a comparative reference, not a determination of applicability to this bank or a substitute for Singapore/bank policy.

The implementation intentionally narrows the work to a predefined command catalogue and reporting operations. Nevertheless, the bank could classify it as AI, a model, analytics/EUC software, or another governed tool. No final MAS interpretation or bank-specific exemption has been verified for this deployment.

Code and template development used ChatGPT assistance. This fact is disclosed; it is not concealed by the absence of a deployed model. The bank may govern AI-assisted software development separately from runtime AI use cases. No bank approval has been obtained by this delivery.

## Live lock is not an approval certificate

`tableau_config.txt` defaults to `mode: sample`, `requireConfirmation: true`, `liveReviewAcknowledged: false`. Bootstrap rejects Tableau live mode until the acknowledgment is set. This is only an administrative guardrail. Browser code/config can be changed by a developer and the low-level engine can be called directly. Actual review, change authorization, hosting permissions and data access must be enforced outside this UI.

Do not mark the tool “Non-AI approved” or “security cleared” merely by setting the flag. Record the approver, decision, approved code/registry hashes, intended users, allowed data scope and permitted future changes in the bank's existing system.

## Questions for the bank's reviewer

1. Is finite command-template mapping to fixed RWA filters/calculations and report templates within ordinary software/EUC governance, or within AI/model governance under the bank's definition?
2. Are the explicitly implemented context shortcuts and literal phrase aliases acceptable within that classification, and which further extensions require reclassification?
3. Are AI-assisted development provenance and optional lab-only MiniLM benchmarking separately permitted?
4. Which reviewed package/registry version, Tableau SDK, source privileges and runtime network origins are approved?

If the bank disallows this language-input path, do not relabel it or bypass review. Stop live deployment and use its approved reporting interface, or obtain approval for a separate form-only design. This delivery is not a form-only alternative and does not claim that such an interface has been assessed.

## Required release evidence

Obtain classification/development approval; complete the controls in `CISO_SECURITY.md`; validate real Tableau/SSO/RLS and data contracts; run a bank-authored holdout test; keep benchmark and live data outside public hosting; establish change control and rollback. The supplied synthetic tests are supporting engineering evidence, not a formal bank validation.
