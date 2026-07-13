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
├── observation-requests/requests.jsonl
├── records/evidence.jsonl
├── verdicts/verdicts.jsonl
├── findings/findings.jsonl
├── audit/<domain-or-run-id>/
│   ├── run-manifest.json
│   ├── evidence.jsonl
│   ├── verdicts.jsonl
│   └── findings.jsonl
├── mappings/
└── index/evidence.db
```

Evidence run directories use stable semantic identifiers such as
`evidence/audit/<domain-id>/observe`, `evidence/audit/<domain-id>/maintain`, or
a caller-provided stable run id. Do not encode wall-clock timestamps in
directory names. This applies to every docs lifecycle artifact path, including
Observe/Maintain audit runs, Synthesis stages, Publication records, and
Knowledge publication ids. Store time metadata inside artifacts instead:

- `run-manifest.json`: `run_id`, `run_started_at`, `run_finished_at`,
  `rerun_of`, `supersedes`, `freshness_checked_at`;
- Evidence records: `observed_at`, `source_version`, `freshness`;
- Verdict records: `reviewed_at`, `evidence_ids`, `scope`;
- Synthesis/Publication manifests: `created_at`, `staged_at`, `published_at`;
- Findings and Observation Requests: `created_at`/`updated_at` when useful.

When rerunning the same task, append new JSONL records or supersede prior run
state inside the stable directory. Use freshness policies (`max_age`,
provider freshness, source-version checks) to decide whether to refresh
evidence. A stale timestamp in metadata triggers Observe/Maintain work; it
does not require creating a new timestamped directory.

YAML and JSONL are authoritative. SQLite is disposable and rebuilt with:

```bash
plugins/gg/scripts/gg-evidence --root <wiki-root> index rebuild
plugins/gg/scripts/gg-evidence --root <wiki-root> index validate
plugins/gg/scripts/gg-evidence --root <wiki-root> storage validate
```

All CLI responses are one JSON object. Exit code `0` means success; `2` means validation or capability failure.

Compiled Knowledge Publications are immutable. `knowledge/registry.json` and
each Domain Manifest are stable Locators, not substitutes for the Claim and
Evidence ledger. A Wiki may contain one optional thin Gateway per domain, but
compiled artifacts do not inherit the Wiki's authority tier.
