---
name: docs-observe
description: Audit existing documentation against local repositories, versioned sources, and profile-declared runtime adapters, extracting atomic Claims, discovering repository scope, collecting static and runtime Evidence, issuing scoped Verdicts and Findings, and drafting approval-gated patches. Use for first-time evidence mapping, static and runtime documentation audits, code-to-doc traceability, repository-scope discovery, and requests to verify whether business docs match current implementation or observable online behavior.
---

# Docs Observe

Build a reproducible fact map from documents, repositories, and optional
business-owned runtime adapters. Static evidence is always allowed when pinned
to repository commits. Runtime evidence is allowed when the Domain Profile
declares an enabled, healthy provider and the observation is narrow, fresh,
redacted, and stored as Evidence. Do not infer deployment, effective runtime
configuration, experiment coverage, traces, metrics, or real traffic from
static sources alone.

Read [references/workflow.md](references/workflow.md) before execution. Use the shared `evidence-backed-docs` schemas and CLI directly.

## Run

1. Validate the Domain Profile and pin every input repository commit.
2. Run `scripts/gg-evidence --root <wiki-root> --profile <profile> adapters preflight`
   when the profile declares runtime adapters. Record available, unavailable,
   degraded, and unsupported providers before judging runtime Claims.
3. Inventory documents, risk-classify sections, and compare them with existing Claim lineage.
4. Discover repositories only inside configured roots. Record every inclusion, exclusion, edge, and unresolved service.
5. Extract candidate Claims at high recall; refine them into atomic, scoped, decidable statements.
6. Ask the `evidence-claim-analyst` playbook to assess claim quality.
7. Locate source candidates, then verify repository, commit, path, symbol, contract, or test directly.
8. For Claims whose business chain depends on online config, request/response
   payloads, logs, traces, metrics, or experiment state, derive runtime
   Observation Requests from static code coordinates or approved document
   coordinates. Before finalizing the run, route each request by generic
   `provider_hints` and `capability` to healthy, profile-declared runtime
   providers. If a matching provider is available and the query is narrow,
   execute it in the same Observe run; store sanitized runtime Evidence, raw
   payload references, observation time, source version, scope, freshness, and
   provider id under the profile's evidence/audit roots. Leave an Observation
   Request unresolved only when no matching healthy provider exists, the query
   is unsafe or too broad, the provider reports insufficient samples, or the
   provider attempt is degraded with a recorded failure class.
9. Produce a scoped Verdict. Use `runtime-supported` or `runtime-contradicted`
   only when fresh runtime Evidence directly supports or contradicts the scoped
   Claim. Use `requires-runtime-evidence` when the adapter is unavailable,
   unmapped, out of scope, unsafe to query, or the sample is insufficient.
   Emit provider-routable Observation Requests for unresolved runtime Claims
   under `evidence/observation-requests/requests.jsonl`.
10. Ask the `evidence-verdict-reviewer` playbook to independently review critical/high-risk results.
11. Write sidecars, Findings, repository scope, run manifest, and an approval
    bundle under a stable evidence/audit run directory. Record
    `run_started_at`, `run_finished_at`, `observed_at`, freshness, and
    supersession metadata inside files; do not encode wall-clock timestamps in
    directory names.
12. Run `scripts/gg-evidence --root <wiki-root> --profile <profile> observation-requests audit-runtime-promotion`
    when runtime adapters or runtime Observation Requests are present. A
    routable request must have runtime Evidence or a recorded degraded attempt,
    and runtime Evidence must be referenced by a Verdict. Run
    `scripts/gg-evidence --root <wiki-root> consistency audit` to catch stale
    Observation Request states, degraded Evidence promoted as terminal runtime
    Verdicts, and published Manifest/Context Pack runtime Evidence conflicts.
    Run `scripts/gg-evidence --root <wiki-root> storage validate`, then rebuild
    and validate the SQLite index. Report numerator, denominator, and uncovered
    items. Preserve every gate's complete CLI `validation_report` in the run
    report; a prose or copied PASS is not authoritative.

## Write boundaries

- Write Evidence artifacts under the profile's evidence/audit roots.
- Generate business-semantic changes as candidate patches only.
- Do not create or update `knowledge/**`, its Registry, Domain Manifests, or
  Publications. Compiled knowledge belongs to the peer `docs-synthesize` and
  `docs-publish` workflows.
- Do not write `.rag/**`; create a cross-capability Finding for RAG drift.
- Do not search outside `repository_roots` or use the network to guess missing repositories.
- Do not create timestamped run directories. Use stable semantic run ids and
  store time/freshness metadata inside run manifests, Evidence, Verdicts, and
  Findings.
- Write durable Evidence coordinates with repository ids, commits/source
  versions, and relative paths. Host absolute paths may appear only in audit
  execution context and must be paired with portable coordinates.
- Emit only Schema-valid Wiki candidate items in an Observe Approval Bundle.
  Unknown types, cross-capability tool changes, Knowledge mutations, and
  non-Wiki targets remain Findings and must not be smuggled into docs-approve.

Observation Requests may name a target `domain_id`, Blueprint `slot_id`, or
existing Knowledge Coordinate so later synthesis/maintenance can route the gap.
For runtime requests, include `capability`, opaque `query`, `provider_hints`,
`required_scope`, `expected_evidence_type`, and `freshness.max_age`. If a
healthy provider can answer the same gap safely within the current Observe
scope, Observe must execute it immediately and write runtime Evidence or a
degraded runtime attempt instead of leaving only a request. Use project-provided
discovery hints when classifying business runtime dependencies; do not hard-code
specific provider, metric, log, or business payload semantics into this
workflow.
Findings may reference a Knowledge Coordinate to identify an affected published
view, but Observe still judges the underlying Claim rather than editing that
view.

## Completion gate

Require all supported/contradicted Verdicts to have reproducible first-party
evidence. A run with healthy, matching runtime providers must not close with
only static Verdicts unless every runtime-sensitive Claim records a specific
provider miss, unsafe query reason, degraded attempt, or insufficient sample
Finding. `consistency audit` must pass or the run must leave a high-severity
Finding that names the conflicting Claim, Evidence, Verdict, and Observation
Request IDs. Report static coverage, runtime coverage, runtime-promoted
Verdicts, and runtime evidence gaps separately.
