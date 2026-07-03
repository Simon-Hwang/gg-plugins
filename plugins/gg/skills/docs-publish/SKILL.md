---
name: docs-publish
description: Validate and transactionally publish an approved evidence-backed Synthesis Bundle and mandatory Agent Context Pack according to a caller-provided Domain Profile, Knowledge Blueprint, and Publication Policy. Use for dry-run publication plans, approval and bundle-hash checks, target routing, freshness and base-hash gates, canonical knowledge publication, status inspection, and safe rollback. Never generate new narrative or bypass approval.
---

# Docs Publish

Operate as a peer of `docs-observe`, `docs-synthesize`, and `docs-maintain`. Consume an approved Synthesis Bundle; do not add publication duties to any other workflow.

Read [references/publication-contract.md](references/publication-contract.md), [references/approval-policy.md](references/approval-policy.md), and [references/rollback-policy.md](references/rollback-policy.md) before planning.

## Required inputs

Require:

- Domain Profile, Knowledge Blueprint, and Publication Policy;
- Synthesis Bundle and Manifest;
- Approval Decision bound to the Bundle hash;
- drafts, mappings, and complete Context Pack;
- current target hashes and current evidence versions.

## Workflow

1. Validate Policy, Bundle, Approval, Context Pack, and input freshness.
2. Validate the domain ID and plan one immutable Knowledge Publication,
   Context Pack, Domain Manifest update, Global Registry update, and optional
   single thin Wiki Gateway as one transaction.
   Ignore `review_artifacts[]`; they are approval views and never targets.
3. Ask `knowledge-publish-planner` to explain the deterministic file plan.
4. Read the immutable `publication_id` from the Blueprint-bound Bundle, then run
   `publications plan --publication-id <id>`; show supported changes and fail closed for any
   change type without an independent deterministic executor.
5. Stop for unapproved change IDs, missing approval roles, stale evidence,
   target escape, base-hash conflicts, dangling Coordinates, invalid
   Registry/Manifest state, or more than one Wiki Gateway target.
6. Run `publications stage --stage-id <id> --publication-id <id>` and validate the complete target
   tree, including Registry and Manifest changes.
7. Ask `semantic-diff-reviewer` to confirm no unapproved semantic change exists,
   then persist a hash-bound record with `publications review-record`.
8. Apply only with `--stage-id <id>` after the Stage status is
   `ready-to-apply`; direct Bundle-to-target Apply is forbidden.
9. Atomically write Publication and Context Pack, advance the Domain Manifest,
   update the Registry, optionally update one Gateway, write Publication and
   Rollback records, rebuild indexes, and run Locator-aware post-publish validation.
10. Roll back automatically on failed hard gates; never overwrite later human edits.

## Deterministic commands

```bash
scripts/gg-evidence --policy <path> publication-policies validate
scripts/gg-evidence --blueprint <path> --bundle <path> synthesis validate
scripts/gg-evidence --bundle <path> --approval <path> approvals validate
scripts/gg-evidence --root <root> --blueprint <path> --policy <path> --bundle <path> \
  --approval <path> publications plan --publication-id <id>
scripts/gg-evidence --root <root> --blueprint <path> --policy <path> --bundle <path> \
  --approval <path> publications stage --stage-id <id> --publication-id <id>
scripts/gg-evidence --root <root> publications review-record \
  --stage-id <id> --review-record <path>
scripts/gg-evidence --root <root> publications apply \
  --stage-id <id> --publication-id <id>
scripts/gg-evidence --root <root> knowledge registry validate
scripts/gg-evidence --root <root> knowledge validate --domain <domain-id>
```

Use `publications apply` only after plan review. Use `publications rollback --publication-id <id>` for hash-safe rollback.

## Hard rules

- Do not generate, rewrite, or reinterpret business narrative.
- Publish only `artifacts[]` sourced from `agent-knowledge/**`. Never copy
  `review-drafts/**` into Knowledge, Context, or Wiki.
- Do not publish without a matching Bundle hash and complete Policy-required roles.
- Do not write outside `allowed_roots`.
- The default canonical target is `knowledge/**`, never four scattered
  `wiki/**` documents. Reject deprecated per-document Wiki routes.
- Permit `wiki/**` only when Policy explicitly enables exactly one
  `gateway_route`; the Gateway contains routing/status metadata and links, not
  a second copy of compiled narrative.
- Do not overwrite a target whose current hash differs from the approved base.
- Apply with deterministic file operations only; no LLM generation during Apply.
- `create` and `replace` are currently executable. `merge`, `redirect`,
  `archive`, and `metadata-only` fail closed until their distinct executors and
  rollback tests exist.
- Publish the Context Pack with the same publication identity and source versions as the knowledge.
- Publication directories are immutable. Only the Domain Manifest current
  pointer, Registry entry, and optional Gateway may change in later
  Publications.
- Domain Manifest and Registry updates are part of the same Stage, Semantic
  Review, Apply, validation, and rollback transaction as the Knowledge files.
- Preserve Publication history after failure or rollback.

## Completion

Complete only when canonical Knowledge targets and Context Pack match the
approved Bundle, the Domain Manifest and Registry resolve every route,
post-publish and Locator validation pass, any Gateway is thin and unique, a
Publication Record exists, and rollback data is complete.
