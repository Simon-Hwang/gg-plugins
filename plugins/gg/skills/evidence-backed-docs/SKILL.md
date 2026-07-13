---
name: evidence-backed-docs
description: Define and operate auditable Claim, Evidence, Verdict, Finding, indexing, approval, and capability protocols for documentation grounded in source code and runtime facts. Use when building evidence sidecars, validating evidence stores, designing domain profiles, reviewing claim lineage, or distinguishing business intent, design decisions, static implementation, and runtime observations.
---

# Evidence-backed Docs

Use this skill as the shared protocol layer for four peer workflows:

- `docs-observe` collects and judges bounded static and runtime facts.
- `docs-synthesize` compiles judged facts into drafts and Agent Context Packs.
- `docs-publish` applies approved bundles transactionally.
- `docs-maintain` incrementally or periodically revalidates published knowledge.

No peer owns or extends another peer's responsibilities. They exchange versioned
contracts through the evidence store, Synthesis Bundle, Publication Record, and
Observation Requests.

Use `docs-approve` as the Codex-native, approval-gated transition for applying
candidate patches produced by `docs-observe`. It is not a fifth lifecycle peer
and is not the Approval Decision used by `docs-publish`.

## Non-negotiable rules

1. Pin repository commits and source versions before judging facts.
2. Treat RAG as candidate retrieval only. Re-read the referenced source.
3. Keep business intent, design decision, static implementation, and runtime observation distinct.
4. Attach scope, observation time, source version, and confidence to every Verdict.
5. Preserve history. Revise wording with a new revision; create a new Claim for semantic changes.
6. Emit a Finding for conflicts or missing evidence. Never silently overwrite business meaning.
7. Restrict repository discovery to Domain Profile `repository_roots`.
8. Never claim online state without a healthy Runtime Adapter.
9. Preserve the complete CLI `validation_report` object for every deterministic
   gate. A prose summary, copied PASS, or report without the validator
   implementation hash, source commit, invocation, explicit input hashes,
   execution time, and result hash is not a validation record.

Read [policies/safety.md](policies/safety.md) before writing evidence. Read [references/storage-layout.md](references/storage-layout.md) when initializing or validating a store.
Read [references/knowledge-locator.md](references/knowledge-locator.md) before
locating or publishing compiled knowledge.

## Three-layer knowledge protocol

- `wiki/**` is human-maintained knowledge and a primary `docs-observe` input.
- `knowledge/**` is immutable, publication-scoped compiled knowledge for Agent
  development, impact-analysis, and code-navigation tasks.
- `evidence/**` is the audit ledger and proof layer.

For development tasks, route through `knowledge/registry.json`, a Domain
Manifest, Retrieval Cards, and Impact/Topology indexes before resolving Claim,
Evidence, and code coordinates. Read Wiki first only for business intent,
operations policy, or an explicit knowledge gap. If Registry validation fails,
report the degradation and fall back explicitly; never silently replace the
Locator with an unbounded repository search.

## Deterministic CLI

Resolve the plugin root, then run:

```bash
scripts/gg-evidence --profile <profile.yaml> profile validate
scripts/gg-evidence --root <wiki-root> claims validate
scripts/gg-evidence --root <wiki-root> observation-requests validate
scripts/gg-evidence --root <wiki-root> storage validate
scripts/gg-evidence --root <wiki-root> index rebuild
scripts/gg-evidence --root <wiki-root> index validate
scripts/gg-evidence --root <wiki-root> index query <text>
scripts/gg-evidence --root <wiki-root> --profile <profile.yaml> adapters preflight
scripts/gg-evidence --root <wiki-root> --profile <profile.yaml> observation-requests audit-runtime-promotion
scripts/gg-evidence --root <wiki-root> consistency audit
scripts/gg-evidence --root <wiki-root> lifecycle audit
scripts/gg-evidence --observe-approval-bundle <bundle.json> \
  observe-approval-bundles validate
scripts/gg-evidence --blueprint <blueprint.json> blueprints validate
scripts/gg-evidence --bundle <bundle> synthesis validate
scripts/gg-evidence --policy <policy.json> publication-policies validate
scripts/gg-evidence --root <root> knowledge registry validate
scripts/gg-evidence --root <root> knowledge locate --intent <text>
scripts/gg-evidence --root <root> knowledge resolve <coordinate>
scripts/gg-evidence --root <root> knowledge inspect --domain <domain-id>
scripts/gg-evidence --root <root> knowledge validate --domain <domain-id>
scripts/gg-evidence --root <wiki-root> --policy <policy.json> \
  --bundle <bundle> --approval <approval.json> publications plan
```

Do not reproduce these checks in prompts. Use CLI JSON output and preserve its
errors and `validation_report` envelope in reports. The envelope identifies the
exact validator implementation even when the source worktree is dirty.

Observe Approval Bundles are Wiki-only executable contracts. Validate them
against `schemas/observe-approval-bundle.schema.json`; unknown item types,
cross-capability tool changes, Knowledge mutations, and targets outside
`wiki/**` fail closed. Keep those concerns as Findings routed to their owning
capability instead of placing them in a docs-approve bundle.

Run `lifecycle audit` after publication Apply, rollback, or lifecycle repair.
It binds Approval Decision, Stage, Publication Record, Domain Manifest, and
Registry states and hashes. Individual files reporting plausible states do not
override a failed lifecycle audit.

Run `consistency audit` before synthesis, publication, and closeout of any
Observe/Maintain run that writes runtime Evidence, runtime Verdicts,
Observation Requests, or Domain Manifests. It catches protocol conflicts such
as terminal runtime Verdicts backed by degraded Evidence, stale open
Observation Requests after runtime-supported Verdicts, and published Domain
Manifests that drop runtime-supported Evidence referenced by their Context
Packs.

## Evidence acceptance

Accept static support or contradiction only when the Evidence contains a resolvable repository, commit, path, and—when asserted—symbol. Accept runtime support or contradiction only when the adapter records environment, scope, observation time, source version, and freshness policy.

Use `requires-runtime-evidence` when static sources cannot prove a time-sensitive statement.

## Stable evidence paths

Evidence paths are stable identifiers, not clocks. All docs workflows
(`docs-observe`, `docs-maintain`, `docs-synthesize`, `docs-approve`,
`docs-publish`) must not add wall-clock suffixes such as `20260708T000000Z` to
`evidence/audit/**`, `evidence/stages/**`, `evidence/publications/**`,
`knowledge/domains/**/publications/**`, or run directories. Put run time and
freshness inside `run-manifest.json`, Evidence `observed_at`, Verdict
`reviewed_at`, Synthesis/Publication manifest timestamps, and freshness
metadata. Reruns of the same task append or supersede records in the same
stable directory. Use `storage validate` before completion to catch timestamped
docs artifact directories.

## Runtime observation providers

GG core treats `adapters.runtime_observation.providers[]` as a generic
observation surface. It routes by `capability`, `provider_hints`,
`expected_evidence_type`, and `required_scope`; project profiles own concrete
providers, commands, query shapes, payload summaries, and business semantics.
Provider preflight is optional and generic. When a provider declares
`preflight`, the command must return one JSON object with `ok: true`, optional
`provider_id`, and optional `capabilities[]`; GG core validates health and
capability coverage but does not interpret provider-specific payloads.

`docs-observe` may execute healthy runtime providers during first-time evidence
mapping when dynamic data is needed to understand or verify a business chain.
`docs-maintain` reuses the same provider contract for later freshness checks,
drift monitoring, and targeted revalidation. Both workflows must treat provider
query shape and payload interpretation as business-owned.

When a runtime Observation Request is routable to a healthy provider by
`provider_hints` and `capability`, `docs-observe` must promote it before
completion: execute the business-owned provider command, write sanitized
runtime Evidence or a degraded runtime attempt, and reference that record from a
Verdict. GG core does not interpret provider payload semantics; it only
enforces generic provenance, scope, freshness, provider id, capability,
Evidence, and Verdict linkage.

Observation Requests are stored at
`evidence/observation-requests/requests.jsonl`. Each request must include a
`freshness.max_age` duration such as `6h` or `1d`. Provider freshness is the
default; request freshness may tighten it but must not be used to loosen a
provider's policy.
