---
description: Plan, validate, apply, inspect, or roll back an approval-gated evidence-backed knowledge publication.
---

# Publish Evidence-backed Knowledge

Invoke the `docs-publish` skill with:

```text
$ARGUMENTS
```

For a new publication require `--profile`, `--blueprint`, `--policy`, `--bundle`, and
`--approval`. Default to a dry-run plan. Require a staged tree, passing
hash-bound Semantic Review Record, and explicit `--apply` before writing targets.

Use `knowledge-publish-planner` to explain the deterministic plan and `semantic-diff-reviewer` to review staged semantic changes. Never generate narrative during publication.

Canonical output defaults to one immutable
`knowledge/domains/<domain-id>/publications/<publication-id>` tree plus its
Context Pack. The same transaction updates the Domain Manifest and
`knowledge/registry.json`. Reject scattered `wiki/**` document routes; allow
only one explicitly configured thin Wiki Gateway.

Support:

```text
--dry-run --publication-id <id>
--stage --stage-id <id> --publication-id <id>
--review-record <path> --stage-id <id>
--apply --stage-id <id> --publication-id <id>
--status <publication-id>
--validate <publication-id>
--rollback <publication-id>
```

Stop for approval mismatch, stale input, target escape, unapproved semantic changes, base-hash conflict, or incomplete Context Pack.
Also stop for Registry/Manifest inconsistency, dangling Coordinates, mutable
Publication targets, invalid typed topology, or an unreachable Knowledge ID.
