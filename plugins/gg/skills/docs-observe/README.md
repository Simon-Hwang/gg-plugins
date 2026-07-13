# Capability matrix

`docs-observe` verifies implementation and business-chain facts using pinned
local repositories, versioned configuration, contracts, tests, approved source
documents, and optional profile-declared runtime adapters. RAG is optional and
non-authoritative.

Runtime deployment, effective configuration, experiments, logs, traces, and
metrics may be verified during Observe only through enabled, healthy,
business-owned providers declared in the Domain Profile. When no safe provider
can answer the scoped question, dependent Claims become
`requires-runtime-evidence` and Observe emits provider-routable Observation
Requests.

When a provider can answer a scoped runtime Observation Request safely, Observe
promotes the request during the same run: execute the business-owned adapter,
write sanitized runtime Evidence or a degraded attempt, and reference that
record from a Verdict. The workflow stays generic; provider query shape and
payload meaning remain in the Domain Profile and adapter documentation.
