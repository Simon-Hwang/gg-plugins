---
name: codex-command-router
description: Use when a Codex user invokes, mentions, or appears to need a GG slash-command workflow such as /gg:plan, /gg:explore, /gg:tdd, /gg:build-fix, /gg:review, /gg:ship, /gg:security-scan, /gg:build-rag, /gg:rag-sync, or /gg:task-trace.
origin: GG Codex adapter
---

# Codex Command Router

This skill adapts GG's Claude Code slash commands to Codex. Codex does not currently expose these files as native slash commands, so treat each command file under `../../commands/` as the source playbook for the same workflow.

When the user writes `/gg:<name>` in Codex, or asks for the equivalent workflow in natural language:

1. Resolve `<name>` to `../../commands/<name>.md`.
2. Read that command file before acting.
3. Follow the command's workflow as an instruction playbook.
4. Translate Claude-only mechanics into Codex equivalents:
   - `Read`, `Grep`, `Glob`, and `Bash` map to Codex file reads, `rg`, and shell commands.
   - Claude subagent delegation maps to Codex multi-agent tools only when the user explicitly asks for delegation or parallel agents.
   - `.claude/` artifacts may be redirected to a project-appropriate location when the command's durable artifact is valuable; otherwise keep output inline.
   - Claude hooks are not manually invoked; rely on active Codex hooks if configured.
   - Claude Code `/compact` and `PreCompact`/`PostCompact` hook workflows are not adapted to Codex. In Codex, produce a handoff summary and continue; do not trigger compaction.
5. Preserve the command's gates, especially "plan before code", "wait for confirmation", and verification evidence.

## Codex-Disabled Claude Surfaces

Treat these GG surfaces as Claude Code-only when operating in Codex:

- `strategic-compact` and Claude Code `/compact`.
- GG plugin hook automation from `../../hooks/hooks.json`, including `PreCompact`, continuous-learning observation hooks, and guard hooks. The hook runtime no-ops by default in Codex unless `GG_ENABLE_CODEX_HOOKS=1` is explicitly set.
- Native slash-command and named-agent registration. Use the command and agent router skills instead.

## Command Catalog

Core delivery:

- `/gg:plan` -> `../../commands/plan.md`
- `/gg:orchestrate` -> `../../commands/orchestrate.md`
- `/gg:feature` -> `../../commands/feature.md`
- `/gg:design` -> `../../commands/design.md`
- `/gg:tdd` -> `../../commands/tdd.md`
- `/gg:build-fix` -> `../../commands/build-fix.md`
- `/gg:review` -> `../../commands/review.md`
- `/gg:refactor` -> `../../commands/refactor.md`
- `/gg:diagnose` -> `../../commands/diagnose.md`
- `/gg:update-docs` -> `../../commands/update-docs.md`
- `/gg:checkpoint` -> `../../commands/checkpoint.md`
- `/gg:ship` -> `../../commands/ship.md`

Exploration and operations:

- `/gg:explore` -> `../../commands/explore.md`
- `/gg:db` -> `../../commands/db.md`
- `/gg:ml` -> `../../commands/ml.md`
- `/gg:security-scan` -> `../../commands/security-scan.md`
- `/gg:observability-ready` -> `../../commands/observability-ready.md`
- `/gg:agent-health` -> `../../commands/agent-health.md`
- `/gg:harness-audit` -> `../../commands/harness-audit.md`
- `/gg:doctor` -> `../../commands/doctor.md`
- `/gg:gg-guide` -> `../../commands/gg-guide.md`

RAG and learning:

- `/gg:build-rag` -> `../../commands/build-rag.md`
- `/gg:rag-sync` -> `../../commands/rag-sync.md`
- `/gg:task-trace` -> `../../commands/task-trace.md`
- `/gg:learn` -> `../../commands/learn.md`
- `/gg:evolve` -> `../../commands/evolve.md`
- `/gg:promote` -> `../../commands/promote.md`
- `/gg:projects` -> `../../commands/projects.md`
- `/gg:instinct-status` -> `../../commands/instinct-status.md`
- `/gg:instinct-export` -> `../../commands/instinct-export.md`
- `/gg:instinct-import` -> `../../commands/instinct-import.md`

Frontend/design:

- `/gg:gan-design` -> `../../commands/gan-design.md`
- `/gg:gan-build` -> `../../commands/gan-build.md`

## Output Rule

Do not merely explain that the command exists. Execute the adapted workflow unless the user is only asking about GG itself.
