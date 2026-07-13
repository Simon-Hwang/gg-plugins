---
description: Validate, rebuild, or query the disposable SQLite index for an evidence-backed documentation store.
---

# Evidence Index

Parse `$ARGUMENTS` as one of:

```text
validate --root <wiki-root>
rebuild --root <wiki-root>
query --root <wiki-root> <text>
```

Run `scripts/gg-evidence` with the equivalent `index` subcommand. Print the
structured JSON result including its complete `validation_report` envelope.
Never edit authoritative YAML or JSONL from this command.
