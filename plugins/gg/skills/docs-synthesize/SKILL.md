---
name: docs-synthesize
description: Compile validated Claim, Evidence, Verdict, Finding, mapping, and repository-edge ledgers into reviewable knowledge drafts and mandatory Agent Context Packs using a caller-provided Domain Profile and Knowledge Blueprint. Use when users want to rebuild evidence-backed business knowledge, generate cross-repository topology or impact indexes, prepare a Synthesis Bundle, or identify missing facts before publication. Never publish canonical knowledge or invent facts.
---

# Docs Synthesize

Operate as a peer of `docs-observe`, `docs-publish`, and `docs-maintain`. Consume their shared evidence protocol directly; do not invoke or extend their responsibilities.

Read [references/knowledge-contract.md](references/knowledge-contract.md),
[references/review-draft-contract.md](references/review-draft-contract.md), and
[references/verdict-rendering-policy.md](references/verdict-rendering-policy.md)
before drafting. Read
[references/context-pack-contract.md](references/context-pack-contract.md)
before generating Agent artifacts.

## Required inputs

Require:

- Domain Profile and Knowledge Blueprint;
- one fixed Observe/Maintain run or explicit Claim scope;
- Claims, Evidence, latest Verdicts, Findings, and mappings;
- repository scope and evidence-backed edges;
- Profile-provided templates, terms, and authority rules.

Run deterministic preflight:

```bash
scripts/gg-evidence --blueprint <path> blueprints validate
scripts/gg-evidence --root <root> claims validate
scripts/gg-evidence --root <root> index validate
```

## Workflow

1. Compute Blueprint slot coverage.
2. Emit Observation Requests for missing required slots.
3. Stop when coverage policy blocks synthesis; generate an explicitly partial Bundle only when the Blueprint permits it.
4. Classify latest Claim revisions as assertable, constrained, or gap-only.
5. Ask `knowledge-architect` to map Blueprint slots into documents without inventing a domain structure.
6. Ask `evidence-knowledge-writer` to generate compact publishable
   `agent-knowledge/` documents from eligible Claim revisions.
7. Derive richer `review-drafts/` from Agent Knowledge and the Context Pack.
   Prefer diagrams, matrices, scenario walkthroughs, and grouped confirmations
   when they improve comprehension; do not impose presentation quotas.
8. Build the mandatory Context Pack: manifest, bilingual/task-aware retrieval
   cards, typed topology, distributed impact index, and slot-specific gaps.
9. Build statement sidecars that bind every factual Agent Knowledge paragraph to existing
   Claim revisions and stable Coordinates.
10. Evaluate the configured golden tasks. Every Knowledge ID must be reachable
   and the Domain/Knowledge retrieval thresholds must pass.
11. Ask `knowledge-synthesis-reviewer` to check publishable knowledge,
    review-to-knowledge consistency, unsupported statements, Verdict
    escalation, mapping integrity, and retrieval usefulness.
12. Validate the complete Bundle and generate an Approval Bundle that routes
    reviewers through review drafts while binding decisions to publishable
    change IDs.

## Hard rules

- Never read code to create a new Verdict. Return missing facts as Observation Requests.
- Every factual paragraph in Agent Knowledge must trace to a Claim ID and revision through its
  sidecar. Human prose uses compact `[E<n>]` anchors and an `Evidence anchors`
  section, not raw Claim/Verdict payloads.
- Coverage accepts structured EligibleClaim records only; a Claim must be current,
  active, scope-compatible, fact-type-compatible, and reproducible. Partial or
  runtime-required Claims produce constrained coverage, never full coverage.
- Runtime-supported Claims are renderable only when their runtime Evidence is
  fresh under the stricter of provider freshness and the originating
  Observation Request's `freshness.max_age`. Stale runtime Evidence becomes a
  gap or constrained statement, never an unconditional runtime fact.
- Keep Intent, Decision, Static Implementation, Runtime Observation, Conflict, and Gap distinct.
- Never turn `partial`, `unknown`, `requires-runtime-evidence`, or `disputed` into an unconditional statement.
- Treat generated diagrams as views; evidence-backed JSONL topology is authoritative.
- Typed Topology must distinguish repository, service, RPC/HTTP, topic,
  storage, config, experiment, external interface, and business stage nodes.
  Never put non-repository entities into `repository_ids`.
- `example` records require `non_factual: true` and cannot contain Claim or
  Evidence markers. `gap` records describe unknowns only and cannot smuggle in
  supported facts.
- Review drafts are non-authoritative projections. They must declare the
  Knowledge IDs they cover and cannot introduce facts absent from those
  publishable documents. Semantic feedback must update Agent Knowledge first;
  only presentation edits may remain review-only.
- Cover every template-required section, every Blueprint slot, and every
  Knowledge ID route. Block process metadata such as `awaiting-approval`,
  `publication_allowed`, Stage state, or Approval state from business prose.
- Treat `knowledge/**` target hints as routing metadata only. Write only the
  configured Synthesis Bundle and never update Registry or canonical targets.

## Completion

Complete only when Blueprint coverage is reported, Agent Knowledge passes
traceability and retrieval checks, all required review drafts map to the
publishable Knowledge IDs, the Context Pack is complete, unsupported
statements and dangling Coordinates are zero, and an approval-ready Synthesis
Bundle exists.
