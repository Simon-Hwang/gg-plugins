---
name: docs-observe
description: Audit existing documentation against local repositories and versioned sources, extracting atomic Claims, discovering repository scope, collecting static Evidence, issuing scoped Verdicts and Findings, and drafting approval-gated patches. Use for first-time evidence mapping, static documentation audits, code-to-doc traceability, repository-scope discovery, and requests to verify whether business docs match current implementation without asserting online state.
---

# Docs Observe

Build a reproducible static fact map. Do not assert deployment, effective runtime config, experiment coverage, or real traffic.

Read [references/workflow.md](references/workflow.md) before execution. Use the shared `evidence-backed-docs` schemas and CLI directly.

## Run

1. Validate the Domain Profile and pin every input repository commit.
2. Inventory documents, risk-classify sections, and compare them with existing Claim lineage.
3. Discover repositories only inside configured roots. Record every inclusion, exclusion, edge, and unresolved service.
4. Extract candidate Claims at high recall; refine them into atomic, scoped, decidable statements.
5. Ask the `evidence-claim-analyst` playbook to assess claim quality.
6. Locate source candidates, then verify repository, commit, path, symbol, contract, or test directly.
7. Produce a scoped Verdict. Use `requires-runtime-evidence` for online-only questions.
8. Ask the `evidence-verdict-reviewer` playbook to independently review critical/high-risk results.
9. Write sidecars, Findings, repository scope, run manifest, and an approval bundle.
10. Rebuild and validate the SQLite index. Report numerator, denominator, and uncovered items.

## Write boundaries

- Write Evidence artifacts under the profile's evidence/audit roots.
- Generate business-semantic changes as candidate patches only.
- Do not create or update `knowledge/**`, its Registry, Domain Manifests, or
  Publications. Compiled knowledge belongs to the peer `docs-synthesize` and
  `docs-publish` workflows.
- Do not write `.rag/**`; create a cross-capability Finding for RAG drift.
- Do not search outside `repository_roots` or use the network to guess missing repositories.

Observation Requests may name a target `domain_id`, Blueprint `slot_id`, or
existing Knowledge Coordinate so later synthesis/maintenance can route the gap.
Findings may reference a Knowledge Coordinate to identify an affected published
view, but Observe still judges the underlying Claim rather than editing that
view.

## Completion gate

Require all supported/contradicted Verdicts to have reproducible first-party evidence. Report static coverage separately from runtime evidence gaps.
