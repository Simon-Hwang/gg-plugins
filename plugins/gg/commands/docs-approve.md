---
description: Review and apply an evidence-backed documentation approval bundle, then revalidate affected Claims and Findings.
---

# Approve Evidence-backed Documentation Changes

In Codex, invoke the `docs-approve` skill and pass `$ARGUMENTS`; this command
file is a compatibility playbook, not a native Slash Prompt.

Require an approval bundle path.

Validate it first with `observe-approval-bundles validate`. Unknown item types,
cross-capability work, Knowledge mutations, and targets outside `wiki/**` fail
closed. Preserve the CLI `validation_report` in the review record.

1. Default to review-only; require explicit approval for named bundle items.
2. Verify the bundle references the current document and evidence versions.
3. Separate deterministic reference fixes from business-semantic changes.
4. Require the business document owner for intent changes and the code owner for implementation assertions.
5. Preserve conflicting owner opinions as `disputed`.
6. Apply only explicitly approved patches.
7. Re-run Claim validation, affected Verdict review, and index validation.
8. Move Findings to `resolved` only after successful revalidation; otherwise use `pending-validation` or `disputed`.

This command applies only Observe-generated Wiki candidate patches. It never
approves a Synthesis Bundle and never writes `knowledge/**`, a Domain Manifest,
or the Global Registry.
