# Storage and CLI contract

Authoritative files:

```text
knowledge/
├── registry.json
└── domains/<domain-id>/
    ├── manifest.json
    └── publications/<publication-id>/
        ├── docs/
        └── context/
evidence/
├── claims/*.yaml
├── records/evidence.jsonl
├── verdicts/verdicts.jsonl
├── findings/findings.jsonl
├── mappings/
└── index/evidence.db
```

YAML and JSONL are authoritative. SQLite is disposable and rebuilt with:

```bash
plugins/gg/scripts/gg-evidence --root <wiki-root> index rebuild
plugins/gg/scripts/gg-evidence --root <wiki-root> index validate
```

All CLI responses are one JSON object. Exit code `0` means success; `2` means validation or capability failure.

Compiled Knowledge Publications are immutable. `knowledge/registry.json` and
each Domain Manifest are stable Locators, not substitutes for the Claim and
Evidence ledger. A Wiki may contain one optional thin Gateway per domain, but
compiled artifacts do not inherit the Wiki's authority tier.
