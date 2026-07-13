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

`publication_id`, Stage ID, and target directories are stable semantic
identities. Do not include wall-clock timestamps in
`evidence/stages/**`, `evidence/publications/**`, or
`knowledge/domains/**/publications/**`. Store timing in `created_at`,
`staged_at`, `published_at`, approval, source-version, and freshness metadata.

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
Successful Apply transitions that Stage to `applied`; a failed Apply transitions
it to `apply-failed` and retains the failed Publication Record. `lifecycle
audit` must confirm that Approval, Stage, Publication, Domain Manifest, and
Registry identities, hashes, and states agree after Apply or rollback.

Every deterministic command result includes a `validation_report` conforming
to `validation-report.schema.json`. Publication reports must preserve it
verbatim so a PASS remains bound to the validator implementation, source
commit, invocation, explicit inputs, execution time, and result hash.

Runtime facts in the Bundle must be backed by runtime Evidence that is fresh
under the stricter of provider freshness and the originating Observation
Request's `freshness.max_age`. Publish does not query providers; missing or
stale runtime Evidence fails closed.
