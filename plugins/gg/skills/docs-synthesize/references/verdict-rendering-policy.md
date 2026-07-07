# Verdict Rendering Policy

| Verdict or fact class | Allowed rendering |
|---|---|
| Approved Intent | Describe as intent only |
| Approved Decision | Describe as a decision and state implementation status |
| `static-supported` | Describe the pinned static implementation |
| `static-contradicted` | Produce a correction candidate and disclose conflict |
| `partial` | State only the supported scope and conditions |
| `unknown` | Put in gaps only |
| `requires-runtime-evidence` | Do not claim runtime effect |
| `runtime-supported` | Include environment, time, source version, adapter, and freshness status |
| `disputed` | Preserve viewpoints; do not choose one |

Any factual paragraph without a Claim ID and revision in its exact-hash
statement sidecar is unsupported and blocks completion. The human-facing
rendering should use a compact Evidence anchor; do not append raw Claim,
Verdict, and Evidence structures to each sentence.

Runtime rendering requires fresh Evidence under the stricter of provider
freshness and the Observation Request's `freshness.max_age`. Stale runtime
Evidence is a gap, not support for current online state.
