---
description: Compile validated evidence ledgers into a reviewable knowledge bundle and mandatory Agent Context Pack using a Domain Profile and Knowledge Blueprint.
---

# Synthesize Evidence-backed Knowledge

Invoke the `docs-synthesize` skill with:

```text
$ARGUMENTS
```

Require `--profile`, `--blueprint`, `--source-root`, and either `--observe-run` or an explicit Claim scope. Accept `--knowledge-id`, `--claim`, `--document`, `--resume`, and `--validate`.

Run Blueprint validation and coverage before drafting. Stop when policy blocks incomplete required slots; otherwise mark partial output explicitly and emit Observation Requests.

Use `knowledge-architect`, `evidence-knowledge-writer`, and `knowledge-synthesis-reviewer`. Produce a Synthesis Bundle and Context Pack only. Never write canonical knowledge targets.

Require template section coverage, exact-hash factual statement sidecars,
Evidence anchors, Typed Topology, Retrieval Card coverage for every Knowledge
ID, distributed Impact Index coverage, slot-specific Gaps, cross-document
consistency, and configured golden-task thresholds. Do not put workflow state
or raw Claim/Verdict structures in business prose.
