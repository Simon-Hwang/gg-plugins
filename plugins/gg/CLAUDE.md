# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code plugin** for Go and Python software delivery — a curated collection of agents, skills, commands, hooks, and rules for the full requirement-to-release workflow, optimised for Go/Python backend engineering.

## Architecture

The plugin is organized into core components under `plugins/gg/`:

- **agents/** — specialized subagents for delegation (planner, code-reviewer, tdd-guide, go-reviewer, etc.)
- **skills/** — workflow definitions and domain knowledge (patterns, testing, security, deployment, RAG, observability)
- **commands/** — slash commands invoked by users (/gg:plan, /gg:go-build, /gg:harness-audit, /gg:build-rag, /gg:rag-sync, etc.)
- **hooks/** — Trigger-based automations (continuous-learning-v2 observation hooks)
- **rules/** — Always-follow guidelines organized by language (common/, golang/, python/)
- **scripts/** — Node.js utilities for hooks and skill dispatch

## Key Commands

### Core Development Flow
- `/gg:plan` — Implementation planning with planner agent
- `/gg:go-build` — Go build, vet, lint checks
- `/gg:go-test` — Go test suite execution
- `/gg:go-review` — Go-specific code review
- `/gg:python-review` — Python code review

### Quality Gates
- `/gg:quality-gate` — Full quality gate (test + lint + security)
- `/gg:test-coverage` — Test coverage report and enforcement
- `/gg:harness-audit` — Deterministic GG harness scorecard for plugin or consumer-project surfaces
- `/gg:security-scan` — Security vulnerability scan
- `/gg:code-review` — General code quality review

### Documentation & Release
- `/gg:update-docs` — Update README, runbooks, and API docs
- `/gg:build-rag` — Full RAG knowledge base build (`.rag/` with L0→L3 + API contracts + ADR + GraphRAG)
- `/gg:rag-sync` — Incremental RAG sync after code changes (git-diff-driven, surgical update via doc-updater)
- `/gg:checkpoint` — Save session state and progress

### Continuous Learning
- `/gg:learn` — Extract patterns from current session
- `/gg:learn-eval` — Evaluate learned patterns
- `/gg:instinct-status` — Show active instincts
- `/gg:evolve` — Evolve and refine instincts
- `/gg:instinct-export` / `/gg:instinct-import` — Portability
- `/gg:promote` — Promote instinct to skill
- `/gg:projects` — Manage project contexts

### Orchestration
- `/gg:orchestrate` — Convert plan into agent chains

### Discovery
- `/gg:gg-guide` — GG plugin usage guide

## Development Notes

- **Plugin format:** Markdown agents with YAML frontmatter (`name`, `description`, `tools`, `model`)
- **Skill format:** `skills/<name>/SKILL.md` with YAML frontmatter and "When to Use" sections
- **Command format:** Markdown with description frontmatter, prefixed `/gg:` in namespace
- **Rule format:** Markdown files under `rules/<language>/`, loaded automatically
- **Hook format:** JSON with matcher conditions in `hooks/hooks.json`; GG default guard hooks live at top level, while skill-level hooks live in `skills/<name>/hooks/hooks.json`
- **File naming:** lowercase with hyphens (e.g., `go-reviewer.md`, `tdd-workflow/SKILL.md`)

## Skills

When working on related files, use the following skills:

| File(s) | Skill |
|---------|-------|
| `agents/*.md` | `using-gg` |
| `skills/*/SKILL.md` | `workspace-surface-audit` |
| `.rag/**` | `repo-rag-builder` |
| `rules/**/*.md` | `coding-standards` |
| `hooks/hooks.json` | `continuous-learning-v2`, `verification-loop`, `security-review` |
| Go source files | `golang-patterns`, `golang-testing` |
| Python source files | `python-patterns`, `python-testing` |
| Database migrations | `database-migrations` |
| Docker/deployment | `docker-patterns`, `deployment-patterns` |
| Subagent context discovery / handoff gaps | `iterative-retrieval` |
| Context-window pressure / pre-orchestrate sizing | `context-budget` |
| Agent loop / drift / repeated failure | `agent-introspection-debugging` |
| Long-lived agent workloads (optional) | `enterprise-agent-ops` |
| Eval-driven development & promote gating (optional) | `eval-harness` |

## P0 Spine (stable, always available)

Agents: `planner`, `architect`, `tdd-guide`, `go-reviewer`, `go-build-resolver`, `python-reviewer`, `build-error-resolver`, `code-reviewer`

Skills: `using-gg`, `plan-orchestrate`, `iterative-retrieval`, `tdd-workflow`, `verification-loop`, `context-budget`, `agent-introspection-debugging`, `golang-patterns`, `golang-testing`, `python-patterns`, `python-testing`

Rules: `rules/common/`, `rules/golang/`, `rules/python/`

Commands: `/gg:plan`, `/gg:go-build`, `/gg:go-test`, `/gg:go-review`, `/gg:python-review`, `/gg:quality-gate`

## Doc Sync Requirement

Doc-sync is narrow, not lockstep. See `AGENTS.md` for the full rule. Summary:

- **Rename / remove an agent:** grep `commands/` and update any thin-shortcut
  command that references it. Optional: refresh the named tables in
  `AGENTS.md` / `CLAUDE.md`.
- **Add / rename / remove a command or skill:** update `agent.yaml` so
  manifest-driven installs resolve. For thin-shortcut commands, verify the
  referenced agent exists.
- There is **no** 1:1 agent↔command contract to maintain. Inline-workflow and
  subsystem-CLI commands stand on their own.
