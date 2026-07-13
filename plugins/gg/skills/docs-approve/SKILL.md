---
name: docs-approve
description: Review and optionally apply candidate documentation patches from a docs-observe Approval Bundle, with explicit owner authorization, version checks, Claim revision preservation, Finding transitions, and post-change validation. Use when a user asks to review, approve, or apply docs-observe findings or writes `/gg:docs-approve`. This is not the Approval Decision workflow for publishing a docs-synthesize bundle.
---

# Docs Approve

Adapt the GG `docs-approve` command playbook for Codex. Operate on an existing
docs-observe Approval Bundle; do not generate new business facts.

## Inputs and default mode

Require the Approval Bundle path. Resolve its Wiki root, affected documents,
Claims, Evidence, Verdicts, Findings, pinned source versions, and proposed
patches.

Before review, run:

```bash
scripts/gg-evidence --observe-approval-bundle <bundle.json> \
  observe-approval-bundles validate
```

Reject unknown item types, cross-capability changes, Knowledge targets, and
targets outside `wiki/**`. Preserve the CLI `validation_report` in the review
record.

Default to review-only. Apply nothing unless the user supplies explicit approval
for named bundle items or a durable approval record that identifies the
approver, role, items, and approved versions.

## Workflow

1. Verify the current target hashes and pinned Evidence versions still match the Bundle.
2. Separate deterministic reference fixes from business-semantic changes.
3. For reference-only fixes, require the configured Wiki maintainer role.
4. For intent changes, require the configured business owner; for implementation
   assertions, require the configured code owner. Require both when one patch
   changes both meanings.
5. Present unapproved items and stop before writing them.
6. Apply only explicitly approved item IDs. Preserve unrelated user changes.
7. Create a new Claim revision for wording changes that preserve meaning; create
   a new Claim for semantic changes. Never rewrite lineage in place.
8. Re-evaluate affected Verdicts against the same pinned sources. Do not convert
   runtime-only gaps into static support.
9. Transition Findings to `resolved` only after successful validation. Otherwise
   use `pending-validation` or `disputed`, preserving the event history.
10. Run deterministic Claim and index validation and report every changed file,
    approval identity, unresolved item, and validation result. Run
    `scripts/gg-evidence --root <wiki-root> storage validate` before closeout.

## Hard rules

- Never infer approval from the existence of an Approval Bundle.
- Never apply all bundle items when the user approves only a subset.
- Never treat code as authority for business intent.
- Never overwrite a target changed since Bundle creation; regenerate the candidate.
- Never use this workflow to approve a Synthesis Bundle. Use `docs-publish` with
  an Approval Decision bound to the Bundle hash.
- Never update `knowledge/**`, a Domain Manifest, or the Global Registry.
  `docs-approve` applies only `docs-observe` candidate patches to the
  human-maintained Wiki.
- Never create timestamped evidence, approval, or audit directories while
  applying a bundle. Keep stable bundle/task paths and record approval time,
  validation time, and freshness inside artifacts.
- Never reinterpret an unknown bundle item. Only `reference-fix`,
  `business-intent-change`, `implementation-assertion-change`, and
  `mixed-semantic-change` are executable; other work remains a Finding routed
  to its owning capability.

## Codex invocation

Codex need not expose native GG slash commands. Invoke this Skill directly with
`$docs-approve`, ask naturally to approve a docs-observe bundle, or type
`/gg:docs-approve <bundle>`; the Codex command router maps that text to this
workflow.
