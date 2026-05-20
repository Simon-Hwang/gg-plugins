---
description: Inspect local GG task trace JSONL and render session summaries or timelines.
argument-hint: "summary|timeline [--session <id>] [--task <id>] [--format json|markdown] [--trace-file <path>]"
---

# Task Trace Command

Inspect local `gg.task-trace.v1` records captured by the `task-trace` skill hooks.

## Usage

`/gg:task-trace summary [--format json|markdown] [--trace-file <path>]`

`/gg:task-trace timeline [--session <id>] [--task <id>] [--format json|markdown] [--trace-file <path>]`

## Deterministic Engine

Run the packaged inspect script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/task-trace-inspect.js" $ARGUMENTS
```

If `CLAUDE_PLUGIN_ROOT` is unavailable in a source checkout, run:

```bash
node plugins/gg/scripts/task-trace-inspect.js $ARGUMENTS
```

## Output

- `summary` groups events by session and reports counts, tools, files, failures, tasks, and signals.
- `timeline` renders ordered events for one session or task.
- `--format json` returns machine-readable output.
- `--format markdown` returns a readable table similar to a lightweight compliance timeline.

## Notes

`signals[]` are best-effort evidence from prompts and tool input. They can show visible references such as `command:/gg:plan`, `skill:task-trace`, or `agent:planner`, but they are not proof of hidden model routing.

## Arguments

$ARGUMENTS:

- `summary|timeline` mode
- `--session <id>` optional session filter
- `--task <id>` optional task filter
- `--format json|markdown` optional output format
- `--trace-file <path>` optional trace file override
- `--write <path>` optional output file

