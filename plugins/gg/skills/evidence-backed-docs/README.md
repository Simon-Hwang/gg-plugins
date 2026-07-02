# Capability matrix

| Capability | Status |
|---|---|
| Profile and Claim validation | available |
| SQLite rebuild, validation, query | available |
| RAG candidate retrieval | optional; never authoritative |
| Static code evidence | available through `docs-observe` |
| Knowledge Registry and Domain Locator | available through deterministic CLI |
| Immutable Agent-facing publications | available through `docs-publish` |
| Wiki-to-Knowledge Gateway | optional; one thin Gateway per domain |
| Deployment/runtime config/experiment | adapter-dependent |
| Trace/metrics | adapter-dependent |
| Online-state conclusions without adapters | prohibited |

Use `scripts/gg-evidence --help` for deterministic operations.
