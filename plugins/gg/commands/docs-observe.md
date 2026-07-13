---
description: Build an auditable static and runtime mapping from documentation Claims to pinned Evidence, using healthy profile-declared providers without overstating online state.
---

# Observe Evidence-backed Documentation

Invoke the `docs-observe` skill with:

```text
$ARGUMENTS
```

Require `--profile <path>` and accept `--root <wiki-root>`, `--document <path>`, `--scope <name>`, `--resume <run-id>`, and `--yes` for non-interactive deterministic gates.

Run Profile validation first. Follow every phase in the skill, use
`evidence-claim-analyst` for Claim quality and `evidence-verdict-reviewer` for
high-risk Verdicts, execute safe scoped requests through a healthy matching
provider, then rebuild and validate the index.

Report the pinned input commits, repository scope, Claim coverage, static and
runtime Verdict counts, runtime promotions and gaps, open Findings, and approval
bundle path. Preserve the CLI `validation_report` object for every gate; a
prose-only PASS is not a validation record.

Do not create or update `knowledge/**`. Observation Requests and Findings may
carry domain/slot/Knowledge Coordinates only as routing metadata.
