# Capability matrix

| Capability | Status |
|---|---|
| Profile and Claim validation | available |
| Observation Request validation | available |
| Wiki-only Observe Approval Bundle validation | available; unknown and cross-capability item types fail closed |
| Validator provenance reports | mandatory on every CLI result |
| Approval/Stage/Publication/Manifest/Registry lifecycle audit | available |
| SQLite rebuild, validation, query | available |
| RAG candidate retrieval | optional; never authoritative |
| Static code evidence | available through `docs-observe` |
| Runtime adapter evidence | available through `docs-observe` and `docs-maintain` when profile-declared providers are healthy |
| Knowledge Registry and Domain Locator | available through deterministic CLI |
| Immutable Agent-facing publications | available through `docs-publish` |
| Wiki-to-Knowledge Gateway | optional; one thin Gateway per domain |
| Deployment/runtime config/experiment | adapter-dependent |
| Logs/trace/metrics | adapter-dependent |
| Online-state conclusions without adapters | prohibited |

Use `scripts/gg-evidence --help` for deterministic operations.
