---
description: Revalidate evidence-backed documentation incrementally or fully, with mandatory runtime capability preflight and explicit degradation.
---

# Maintain Evidence-backed Documentation

Invoke the `docs-maintain` skill with:

```text
$ARGUMENTS
```

Require `--profile <path>` and `--root <wiki-root>`. Accept exactly one selector:
`--claim`, `--document`, `--knowledge`, `--domain`, `--scope`,
`--changed-since`, or `--full`.

Run adapter preflight before reading runtime facts. Stop when the static foundation is incomplete. Otherwise append fresh Evidence and Verdicts, revalidate Findings, update overdue/review states, and report every unavailable capability.

For a compiled domain, start from its validated Domain Manifest and map changed
Claims to Knowledge Coordinates. Never edit an immutable Publication; emit a
resynthesis request and let `docs-publish` advance the current pointer.
