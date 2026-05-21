---
description: Run a deterministic GG observability readiness check and report install status.
argument-hint: "[--format text|json] [--root <path>]"
---

# Observability Ready Command

Run a deterministic pre-flight check of the GG observability surface. Verifies
that task-trace, harness-audit, eval-harness, and hook runtime are properly
installed and intact.

Use this before shipping, promoting instincts, or starting autonomous loops
where traceability matters.

## Usage

`/gg:observability-ready [--format text|json] [--root <path>]`

## Deterministic Engine

Always run the packaged readiness script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/observability-readiness.js" $ARGUMENTS
```

If `CLAUDE_PLUGIN_ROOT` is unavailable in a source checkout, run:

```bash
node plugins/gg/scripts/observability-readiness.js $ARGUMENTS
```

## Output Contract

Returns:

1. `overall_score` out of `max_score` (12 points total)
2. `ready: true/false` — all checks passed
3. Category breakdown: Task Tracing, Harness Baseline, Eval Coverage, Hook Runtime
4. Per-check PASS/FAIL with point value and description
5. `top_actions[]` — up to 3 highest-impact fixes if not ready

Schema: `gg.observability-readiness.v1`, rubric: `gg-2026-05-21`

## Checks (12 pts max)

| Check | Points | Category |
|-------|--------|----------|
| task-trace hook script present | 2 | Task Tracing |
| task-trace inspect script present | 2 | Task Tracing |
| harness-audit script present | 2 | Harness Baseline |
| eval-harness skill present | 2 | Eval Coverage |
| enterprise-agent-ops skill present | 1 | Eval Coverage |
| hooks/hooks.json valid + dispatcher present | 2 | Hook Runtime |
| task-trace command present | 1 | Hook Runtime |

## Fix Actions

When checks fail, install the missing module:

- **Task Tracing / Eval Coverage**: install `skills-observability` module
- **Hook Runtime**: reinstall `hooks-runtime` module or verify plugin root

## Arguments

$ARGUMENTS:

- `--format text|json` — output format (default: text)
- `--root <path>` — plugin root to inspect (default: auto-detected from `CLAUDE_PLUGIN_ROOT`)
