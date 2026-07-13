# Human Review Draft Contract

`review-drafts/` is the primary human approval surface.
`agent-knowledge/` is the only publishable narrative surface.

Each Blueprint `review_documents[]` entry declares:

```yaml
review_id: domain-flow-review
template: review-templates/flow.md
target_hint: review-drafts/flow.md
covers_knowledge_ids: [domain-flow]
required_sections: [一分钟结论, 业务流程, 关键分支, 待确认事项, Knowledge sources]
```

The Synthesis Manifest mirrors it in `review_artifacts[]` with `review_id`,
Bundle-relative `source`, and identical `covers_knowledge_ids`.

Review drafts must be decision-ready owner packets, not structural shells. A
business-owner or code-owner should be able to decide approve, reject, or
needs-work from `review-drafts/**` itself, without opening `agent-knowledge/`,
coverage reports, grouped gaps, Observation Requests, or raw ledgers to assemble
the argument. Those artifacts remain the traceable substrate; the review draft
is the readable synthesis.

Review drafts should make approval easier through whichever forms fit the
evidence: plain-language conclusions, evidence summaries, Mermaid views, stage
tables, responsibility matrices, scenario walkthroughs, regression checklists,
freshness notes, runtime-vs-static distinction, owner action lists, or grouped
gaps. None is a universal count-based gate.

Review drafts do not maintain duplicate paragraph sidecars. They must name the
covered Knowledge IDs, include reviewer-facing content under every declared
required section, and use the same Evidence anchors or Coordinates when
drilling down. They cannot introduce a fact absent from their mapped Agent
Knowledge.

Approval decisions still target `artifacts[].change_id`. Both views are inside
the same Bundle hash. A semantic correction requested from a review draft must
first change Agent Knowledge and its statement sidecar, then regenerate the
review view and Bundle hash. Review-only edits are limited to presentation,
layout, and non-semantic compression.
