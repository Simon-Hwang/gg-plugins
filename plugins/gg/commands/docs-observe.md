---
description: Build an auditable static mapping from documentation Claims to source-code Evidence without asserting online runtime state.
---

# Observe Evidence-backed Documentation

Invoke the `docs-observe` skill with:

```text
$ARGUMENTS
```

Require `--profile <path>` and accept `--root <wiki-root>`, `--document <path>`, `--scope <name>`, `--resume <run-id>`, and `--yes` for non-interactive deterministic gates.

Run Profile validation first. Follow every phase in the skill, use `evidence-claim-analyst` for Claim quality and `evidence-verdict-reviewer` for high-risk Verdicts, then rebuild and validate the index.

Report the pinned input commits, repository scope, Claim coverage, static Verdict counts, runtime evidence gaps, open Findings, and approval bundle path.

Do not create or update `knowledge/**`. Observation Requests and Findings may
carry domain/slot/Knowledge Coordinates only as routing metadata.
