# GG Future Expansion

GG stays focused on Claude Code commands, skills, agents, common rules, and a narrow continuous-learning observation hook surface. The following capabilities are intentionally deferred.

## Runtime Hooks

Possible future hooks:

- Format and lint checks after file edits.
- Typecheck or test reminders after implementation.
- Console/debug-log warnings.
- Secret and credential prompts before risky writes.
- Pre-commit quality gate.

Reason for deferral: hooks create stronger enforcement but increase maintenance cost and false-positive risk.

## Recommended MCP Integrations

Possible future recommendations:

- Context7 for current library documentation.
- Playwright for browser testing.
- GitHub for issues, PRs, checks, and release workflows.
- Memory for longer-lived project knowledge.

Reason for deferral: MCP should enhance the workflow without becoming required for the base plugin.

## Cross-Harness Adapters

Possible future targets:

- Cursor
- Codex
- OpenCode

Reason for deferral: the first version is Claude Code only, but the skill-first layout keeps future adaptation possible.

## Broader Local State and Session Observation

Now partially addressed:

- **Context-size tracking** — covered by the core `context-budget` skill, which
  audits token overhead across agents, skills, rules, MCP servers, and
  CLAUDE.md and surfaces ranked savings recommendations. It does not yet persist
  per-session token traces; that remains deferred (see "Still deferred" below).
- **Long-lived agent observability** — covered by the optional
  `enterprise-agent-ops` skill (`skills-observability` module): lifecycle,
  baseline controls, tracked metrics (success rate, mean retries, time to
  recovery, cost per successful task, failure class distribution), and a 6-step
  incident pattern.
- **Promote-gate quality bar** — covered by the optional `eval-harness` skill,
  which provides `pass@k` / `pass^k` evals to gate `/gg:promote` on functional
  regression instead of confidence alone.
- **Task-level trace persistence** — covered by the optional `task-trace` skill
  (`skills-observability` module): local `gg.task-trace.v1` JSONL capture for
  user prompts, tool completions/failures, file activity, and visible
  skill/agent/command signals, plus `/gg:task-trace` summary and timeline
  inspection.

Still deferred:

- Per-token and cost traces across step → agent → tool boundaries.
- Verification history (cross-session aggregation of `verification-loop` runs).
- Team-governed promotion workflows for learned project patterns.

Reason for deferral: these broader capabilities need careful data modeling and
privacy expectations beyond what the single-user instinct store covers.

## Security Scanner Integration

Possible future integrations:

- Secret scanning.
- Dependency vulnerability checks.
- Configuration and plugin security audits.

Reason for deferral: first version provides checklist-based review and leaves external tool selection to the project.
