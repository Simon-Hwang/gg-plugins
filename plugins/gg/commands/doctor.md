---
description: Inspect GG plugin install health and report missing or corrupted component files.
argument-hint: "[--component <id>] [--format text|json] [--root <path>]"
---

# Doctor Command

Inspect GG plugin install health. Checks that key files for each component
(hooks-runtime, commands-core, skills-workflow, agents-core, skills-observability)
are present and structurally valid.

Use when commands behave unexpectedly, after upgrading GG, or after a partial install.

## Usage

`/gg:doctor [--component <id>] [--format text|json] [--root <path>]`

## Deterministic Engine

Always run the packaged script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.js" $ARGUMENTS
```

If `CLAUDE_PLUGIN_ROOT` is unavailable in a source checkout:

```bash
node plugins/gg/scripts/doctor.js $ARGUMENTS
```

## Output Contract

Returns per-component status:
- `ok` — all key files present, no structural issues
- `warning` — optional files missing (skills-observability not installed is a warning, not error)
- `error` — required files missing or corrupted

JSON schema: `gg.doctor.v1`

Exit code `1` when any warnings or errors are found; `0` when all components are healthy.

## Components Checked

| Component | Key Files |
|-----------|-----------|
| `hooks-runtime` | hooks.json, skill-hook-dispatcher.js, plugin-hook-bootstrap.js, run-with-flags.js |
| `commands-core` | plan.md, ship.md, harness-audit.js, harness-audit.md |
| `skills-workflow` | skills/using-gg, tdd-workflow, verification-loop |
| `agents-core` | agents/planner.md, architect.md |
| `skills-observability` | task-trace hook + inspect, eval-harness skill (warnings if missing) |

## Remediation

When errors are found:

1. Note the missing component from the output
2. Reinstall via the GG installer for that component
3. Re-run `/gg:doctor` to confirm

## Arguments

$ARGUMENTS:

- `--component <id>` — check only this component (repeatable); valid: `hooks-runtime`, `commands-core`, `skills-workflow`, `agents-core`, `skills-observability`
- `--format text|json` — output format (default: text)
- `--root <path>` — plugin root to inspect (default: auto-detected from `CLAUDE_PLUGIN_ROOT`)
