# Publication Contract

Require a Synthesis Manifest containing unique approved `change_id` entries:

```yaml
artifacts:
  - change_id: create-overview
    knowledge_id: knowledge-overview
    change_type: create
    source: agent-knowledge/overview.md
    statements: statements/knowledge-overview.jsonl
    target: knowledge/domains/{domain_id}/publications/{publication_id}/docs/overview.md
    base_hash: null
```

The contract names `create`, `replace`, `merge`, `redirect`, `archive`, and
`metadata-only`, but the executor must fail closed for any type that lacks
distinct planning, staging, validation, apply, and rollback semantics. A
generic file copy is never a valid implementation of those semantics. All
source and target paths must be relative. Targets must remain under Publication
Policy `allowed_roots`.

`review_artifacts[]` and `review-drafts/**` are hash-bound approval aids, not
publication artifacts. The executor ignores them. Only `artifacts[]` sourced
from `agent-knowledge/**` may become canonical Knowledge narrative.

Policy must declare:

```yaml
knowledge_route:
  target: knowledge/domains/{domain_id}/publications/{publication_id}
domain_manifest_route:
  target: knowledge/domains/{domain_id}/manifest.json
registry_route:
  target: knowledge/registry.json
gateway_route:
  enabled: false
```

Legacy `routes[].target = wiki/**` is deprecated and must fail closed. The only
permitted Wiki write is one explicitly enabled thin Gateway route. The Gateway
links to the Domain Manifest and current Knowledge; it does not duplicate the
four compiled documents.

Publish immutable knowledge and the complete Context Pack under one publication
identity. In the same transaction, advance the Domain Manifest and Global
Registry. Preserve before/after snapshots, hashes, approval, status, and the
prior Manifest/Registry pointer.

Select `publication_id` before synthesis and record it in the Synthesis
Manifest and Knowledge Coordinates. The dry-run plan and Stage are both bound
to it; Apply must use the identical value and cannot rename the Bundle.
Plan and Stage must also receive the caller-provided Knowledge Blueprint so
required documents and section headings are validated independently of Bundle
self-reporting.

The Stage contains and validates:

```text
knowledge publication tree
Context Pack
Domain Manifest
Global Registry
optional Wiki Gateway
Publication and Rollback metadata
```

Apply requires a `ready-to-apply` Stage Manifest bound to Bundle, Policy,
Approval, current targets, staged tree, and a passing Semantic Review Record.
