---
description: Run a deterministic GG harness audit and return a prioritized scorecard.
---

# Harness Audit Command

Run a deterministic audit of the GG plugin surface or a consumer project and return a scorecard with concrete remediation steps.

## Usage

`/gg:harness-audit [scope] [--format text|json] [--root <path>]`

- `scope` (optional): `repo` (default), `hooks`, `skills`, `commands`, `agents`
- `--format`: output style (`text` default, `json` for automation)
- `--root`: audit a specific root instead of the current working directory

## Deterministic Engine

Always run:

```bash
node plugins/gg/scripts/harness-audit.js <scope> --format <text|json>
```

If the command is running from an installed plugin rather than the source checkout, resolve the packaged `scripts/harness-audit.js` path from the GG plugin install root. The script is the single source of truth for scoring and checks. Do not invent extra categories or manual scoring.

Rubric version: `gg-2026-05-18`.

The script computes 7 fixed categories, normalized to `0-10`:

1. Tool Coverage
2. Context Efficiency
3. Quality Gates
4. Memory Persistence
5. Eval Coverage
6. Security Guardrails
7. Cost Efficiency

## Output Contract

Return:

1. `overall_score` out of `max_score`
2. Category scores and checked evidence
3. Failed checks with exact paths
4. The deterministic top 3 actions from `top_actions`
5. The command run and whether output came from source checkout or installed plugin

## Checklist

- Use script output directly; do not rescore manually.
- If `--format json` is requested, return the JSON output unchanged.
- For text output, summarize failing checks and top actions.
- Include exact paths from `checks[]` and `top_actions[]`.

## Arguments

$ARGUMENTS:

- `repo|hooks|skills|commands|agents` optional scope
- `--format text|json` optional output format
- `--root <path>` optional root override
