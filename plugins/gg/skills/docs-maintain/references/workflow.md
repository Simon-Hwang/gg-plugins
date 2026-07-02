# Maintenance capability matrix

| Missing capability | Required degradation |
|---|---|
| Deployment | Do not claim the deployed version equals repository HEAD |
| Runtime config | Do not claim configured defaults are effective online |
| Experiment | Keep rollout and population Claims partial/unknown |
| Trace or metrics | Do not prove actual call occurrence or quantitative effect |
| Ownership | Keep the Finding unowned and route to the unowned queue |
| Scheduler | Allow manual runs; do not claim continuous maintenance |

A full run checks adapter health, Evidence freshness, high-risk Claims, store integrity, RAG/docs drift, Finding revalidation, overdue states, and accepted-risk review dates.

For compiled knowledge, propagate changes through:

```text
source change
→ affected Claim
→ affected Knowledge Coordinate
→ affected immutable Publication and domain
→ revalidate or request resynthesis
```

Start from the current Domain Manifest, not from scattered Wiki paths. Preserve
published directories; a new publication advances the manifest pointer through
`docs-publish`.
