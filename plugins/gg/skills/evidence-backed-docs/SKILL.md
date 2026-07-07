---
name: evidence-backed-docs
description: Define and operate auditable Claim, Evidence, Verdict, Finding, indexing, approval, and capability protocols for documentation grounded in source code and runtime facts. Use when building evidence sidecars, validating evidence stores, designing domain profiles, reviewing claim lineage, or distinguishing business intent, design decisions, static implementation, and runtime observations.
---

# Evidence-backed Docs

Use this skill as the shared protocol layer for four peer workflows:

- `docs-observe` collects and judges bounded facts.
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
scripts/gg-evidence --root <wiki-root> index rebuild
scripts/gg-evidence --root <wiki-root> index validate
scripts/gg-evidence --root <wiki-root> index query <text>
scripts/gg-evidence --root <wiki-root> --profile <profile.yaml> adapters preflight
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

Do not reproduce these checks in prompts. Use CLI JSON output and preserve its errors in reports.

## Evidence acceptance

Accept static support or contradiction only when the Evidence contains a resolvable repository, commit, path, and—when asserted—symbol. Accept runtime support or contradiction only when the adapter records environment, scope, observation time, source version, and freshness policy.

Use `requires-runtime-evidence` when static sources cannot prove a time-sensitive statement.

## Runtime observation providers

GG core treats `adapters.runtime_observation.providers[]` as a generic
observation surface. It routes by `capability`, `provider_hints`,
`expected_evidence_type`, and `required_scope`; project profiles own concrete
providers, commands, query shapes, payload summaries, and business semantics.
Provider preflight is optional and generic. When a provider declares
`preflight`, the command must return one JSON object with `ok: true`, optional
`provider_id`, and optional `capabilities[]`; GG core validates health and
capability coverage but does not interpret provider-specific payloads.

Observation Requests are stored at
`evidence/observation-requests/requests.jsonl`. Each request must include a
`freshness.max_age` duration such as `6h` or `1d`. Provider freshness is the
default; request freshness may tighten it but must not be used to loosen a
provider's policy.
