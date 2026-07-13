# Knowledge Contract

Require a caller-provided Blueprint with a `domain_id`, unique knowledge slots
and document IDs, required template sections, and Agent-routing expectations.
Every draft must include a stable `knowledge_id`, Blueprint ID, scope, Agent
routing metadata, verification status, source versions, coverage, and open
Findings.

Do not copy the evidence ledger into prose. Write readable business/engineering
narrative with compact `[E<n>]` anchors and a per-document `Evidence anchors`
section whose entries resolve to `claim://<claim-id>@<revision>`. Store one
JSONL statement sidecar per knowledge artifact. Each factual paragraph must
have a stable statement ID, exact paragraph hash, non-empty Claim references,
Evidence references when available, and stable Knowledge/Claim/Evidence/code
Coordinates.

An `example` must declare `non_factual: true` and contain no Claim/Evidence
marker. A `gap` describes an unknown only; split mixed supported/unknown
paragraphs. Process state such as Bundle, Stage, Approval, or publication
eligibility is report metadata and must not enter business drafts.

Blueprint-required Agent Knowledge sections and knowledge primitives are hard
gates. Review drafts are validated as human approval surfaces: every declared
required heading must contain reviewer-facing content and the draft must name
the Knowledge IDs it covers. Diagrams, tables, and walkthroughs are recommended
presentation choices, not quota gates. Elect one primary document for
duplicated concepts and reference it elsewhere so Owner authority,
verification status, scope, and gap language cannot contradict across views.

Required dual-view Synthesis Bundle:

```text
synthesis-manifest.yaml|json
review-drafts/       # human approval views; never published
agent-knowledge/     # compact canonical knowledge; publish source
statements/
context-pack/
mappings/
coverage/
reports/
approval-bundle.md
```

`artifacts[]` points only to `agent-knowledge/**`. `review_artifacts[]` maps
each human review view to one or more published Knowledge IDs. Review drafts
are included in the Bundle hash and approval scope but never become Publication
targets. Approval readers should not have to reconstruct the decision basis
from Agent Knowledge, coverage, gaps, Observation Requests, and ledgers; the
review draft should summarize those inputs at owner-readable fidelity while
preserving anchors back to the traceable source.

When a fact needed by a required slot is absent, emit an Observation Request rather than reading code and judging it inside synthesis.

Draft paths remain Bundle-local. Canonical routing belongs to Publication
Policy and must resolve under:

```text
knowledge/domains/<domain-id>/publications/<publication-id>/
```

Synthesize never creates a Domain Manifest, Registry, or Wiki Gateway.

Select the immutable `publication_id` before synthesis and record it in the
Synthesis Manifest. All `knowledge://` Coordinates in drafts, sidecars, and the
Context Pack must use that identity. Publication may not rename the Bundle.

`synthesis validate` must receive the caller-provided Blueprint and enforce its
document set and required headings directly. `approval-bundle.md` must name the
current `synthesis_id` and every proposed `change_id`; copied approval prose
from an older Bundle is invalid.
