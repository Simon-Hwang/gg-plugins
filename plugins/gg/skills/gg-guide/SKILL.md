---
name: gg-guide
description: Guide users through GG's skills, commands, agents, hooks, rules, and project workflows by reading the live plugin surface before answering. Use when navigating, discovering, or choosing GG components for Go, Python, database, security, or release-bound work.
origin: gg
---

# GG Guide

Use this skill when a user needs help understanding, navigating, or choosing capabilities bundled with the GG plugin.

## When To Use

Use this skill when the user:

- asks what GG includes or provides
- wants help finding a skill, command, agent, hook, or rule
- is new to GG and needs a guided path into Go or Python backend work
- asks "how do I do X with GG?"
- asks which GG components fit a specific project, stack, or workflow
- needs a lightweight explanation of how commands, skills, agents, hooks, and rules relate in GG
- is confused about which phase gate or agent chain to use

Do not use this skill for:

- Tiny one-off questions with no workflow artifact needed
- Pure repository archaeology; prefer `repo-scan`
- Workspace capability scanning; prefer `workspace-surface-audit`

## Core Principle

Answer from current files, not memory. GG surfaces evolve, so hard-coded feature lists go stale.

When the GG plugin directory is available, inspect the relevant files before giving a concrete answer:

```bash
find skills -maxdepth 2 -name SKILL.md | sort
find commands -maxdepth 1 -name '*.md' | sort
find agents -maxdepth 1 -name '*.md' | sort
rg -n "<query>" skills commands agents
```

Use the smallest set of reads needed for the user's question.

## Plugin Map

```
plugins/gg/
  README.md                    — plugin overview, P0/P1/P2 asset registry, task push flow
  gg-commands-reference.md     — slash command reference and recommended command chains
  plugin.json                  — plugin metadata and registration
  agents/                      — delegated subagent role prompts
  commands/                    — slash-command prompts (prefix: /gg:)
  skills/*/SKILL.md            — reusable workflows and domain playbooks
  rules/common/                — language-agnostic workflow rules
  rules/golang/                — Go-specific rules
  rules/python/                — Python-specific rules
  hooks/hooks.json             — plugin lifecycle hook registration
  scripts/hooks/               — hook dispatch scripts (skill-hook-dispatcher, observe-runner)
  future-expansion.md          — staged second-phase roadmap
```

## GG Asset Registry

### P0 — Go/Python Delivery Spine

| Type | Assets |
|---|---|
| Skills | `using-gg`, `plan-orchestrate`, `iterative-retrieval`, `tdd-workflow`, `verification-loop`, `context-budget`, `agent-introspection-debugging`, `golang-patterns`, `golang-testing`, `python-patterns`, `python-testing` |
| Agents | `planner`, `architect`, `tdd-guide`, `go-reviewer`, `go-build-resolver`, `python-reviewer`, `build-error-resolver`, `code-reviewer` |
| Commands | `/gg:plan`, `/gg:go-build`, `/gg:go-test`, `/gg:go-review`, `/gg:python-review`, `/gg:quality-gate` |
| Rules | `rules/common/`, `rules/golang/`, `rules/python/` |

### P1 — Backend Engineering, Security, Docs, Release

| Type | Assets |
|---|---|
| Skills | `security-review`, `security-scan`, `repo-scan`, `workspace-surface-audit`, `search-first`, `git-workflow`, `database-migrations`, `postgres-patterns`, `mysql-patterns`, `deployment-patterns`, `docker-patterns`, `gg-guide` |
| Agents | `security-reviewer`, `doc-updater`, `database-reviewer` |
| Commands | `/gg:security-scan`, `/gg:code-review`, `/gg:test-coverage`, `/gg:update-docs`, `/gg:checkpoint`, `/gg:build-fix` |

### P2 — Continuous Learning (Optional)

| Type | Assets |
|---|---|
| Skill | `continuous-learning-v2` |
| Commands | `/gg:learn`, `/gg:learn-eval`, `/gg:instinct-status`, `/gg:evolve`, `/gg:instinct-export`, `/gg:instinct-import`, `/gg:promote`, `/gg:projects` |
| Hooks | `hooks/hooks.json` default guard hooks + `scripts/hooks/skill-hook-dispatcher.js` → `continuous-learning-v2/hooks/hooks.json` → `observe-runner.js` |

### P2 — Observability & Eval (Optional)

| Type | Assets |
|---|---|
| Skills | `enterprise-agent-ops`, `eval-harness`, `task-trace` |
| Commands | `/gg:task-trace` |
| Pairs with | `continuous-learning-v2` (gate `/gg:promote` on `eval-harness` pass^3=100%); `verification-loop` (deterministic graders); `agent-introspection-debugging` (failure-pattern evidence); `task-trace` (local prompt/tool/file timelines) |
| Use when | Operating long-lived agents (cloud / background loops), quantifying whether evolved instincts/skills are better than baseline, or inspecting how a local GG task actually progressed |

### Extended Skills

| Skill | Purpose |
|---|---|
| `github-ops` | Live PR management, CI checks, releases, issue triage, GitHub security alerts |
| `team-builder` | Compose ad-hoc parallel agent teams from the GG catalogue |
| `terminal-ops` | Evidence-first command execution, CI/build debugging, git-state inspection |
| `gg-guide` | This skill — navigate GG components and choose the right surface |
| `iterative-retrieval` | Progressive codebase context discovery and structured handoffs before subagent dispatch |
| `context-budget` | Audit token overhead across agents/skills/rules/MCP/CLAUDE.md and surface savings |
| `agent-introspection-debugging` | 4-phase agent self-debug SOP (capture → diagnose → contained recovery → introspection report) |
| `enterprise-agent-ops` (P2) | Lifecycle, metrics, and incident pattern for long-lived agent workloads |
| `eval-harness` (P2) | Eval-driven development with `pass@k` / `pass^k` for gating instinct promotion and release-critical paths |
| `task-trace` (P2) | Local JSONL task timeline capture and `/gg:task-trace` inspection for prompts, tools, files, failures, and visible skill/agent signals |

## Phase Gates (Quick Reference)

GG work flows through these gates. Never skip one silently.

| Phase | Goal | Key Surface |
|---|---|---|
| 0. Route | Classify stack, risk, path | `using-gg`, `workspace-surface-audit`, `iterative-retrieval` |
| 1. Plan | Confirm requirements and steps | `/gg:plan`, `planner`, `architect` |
| 2. Orchestrate | Decompose into agent chains | `plan-orchestrate`, `iterative-retrieval` |
| 3. TDD | RED→GREEN→refactor | `tdd-workflow`, `tdd-guide`, `/gg:go-test` |
| 4. Verify | Prove implementation works | `verification-loop`, `/gg:go-build`, `/gg:quality-gate` |
| 5. Review | Quality, security, domain | reviewer agents, `/gg:go-review`, `/gg:python-review`, `/gg:code-review` |
| 6. Close | Docs, branch, PR, release | `/gg:update-docs`, `git-workflow`, `deployment-patterns` |

## Response Style

Lead with the answer, then give the next action. Most users do not need a full catalog dump.

Good first response shape:

1. what to use
2. why it fits
3. exact file or command to inspect
4. one next command or question

Avoid:

- listing every skill or command by default
- repeating large README sections
- claiming a component exists without checking the filesystem first
- recommending a lower-level command when a skill-first path exists

## Common Tasks

### New User Onboarding

Give a short menu:

- inspect the GG plugin structure with `README.md` and `gg-commands-reference.md`
- pick a workflow path: Go feature, Python feature, database, security, or release
- understand how commands, skills, agents, and hooks relate in GG
- understand phase gates and when to invoke each
- find a specific skill, command, or agent for a task

Point to `gg-commands-reference.md` for command chains and `using-gg` for the main routing workflow.

### Stack Identification

When the user has not specified a stack, detect from project files:

| Signal | Stack |
|---|---|
| `go.mod`, `*.go`, goroutines, channels | Go |
| `pyproject.toml`, `requirements.txt`, `*.py`, pytest | Python |
| migrations, schema files, SQL, connection pool config | Database |
| Auth, secrets, PII, payment, user input | Security-sensitive |
| Dockerfile, `docker-compose.yml`, deploy configs | Docker/Deployment |

### Feature Discovery

For "what should I use for X?":

1. Search `skills/`, `commands/`, and `agents/` with ripgrep.
2. Prefer skills as the primary workflow surface.
3. Use commands when the user explicitly wants slash-command behavior or the command is the canonical GG entrypoint.
4. Mention agents when delegation or subagent chains are useful.

Useful searches:

```bash
rg -n "<query>" skills commands agents
find skills -maxdepth 2 -name SKILL.md | sort
```

### Agent Chain Selection

For multi-step work, select from the recommended chains in `gg-commands-reference.md`:

- Go feature: `planner → tdd-guide → go-build-resolver → go-reviewer → security-reviewer → doc-updater`
- Python feature: `planner → tdd-guide → build-error-resolver → python-reviewer → security-reviewer → doc-updater`
- Database-impacting: add `database-reviewer`, `database-migrations`, and relevant DB pattern skill
- Release-sensitive: add `verification-loop`, `deployment-patterns`, `docker-patterns`

Then use `plan-orchestrate` to convert the chain into ready-to-run orchestration prompts.

### Workspace Artifacts

GG persists workflow artifacts under `.gg/` in the target project:

```text
.gg/
  requirements/
  designs/
  tasks/
  checklists/
  verification/
  release/
  docs/
```

Only create `.gg/` artifacts for non-trivial work. Skip for one-off explanations.

### Continuous Learning Navigation

The P2 `continuous-learning-v2` system provides:

- `/gg:learn` — extract reusable patterns from the current session
- `/gg:instinct-status` — show learned instincts for project and global scope
- `/gg:evolve` — cluster instincts into candidate skills, commands, or agents
- `/gg:promote` — promote project instincts to global scope

Configuration lives in `skills/continuous-learning-v2/config.json`. The observer is disabled by default (`observer.enabled=false`). Hooks still capture observations; automated background analysis requires explicit enabling.

### Troubleshooting

Ask for the target harness and install path first, then inspect:

- `plugin.json` for plugin metadata
- `.claude/`, `.cursor/` for installed surfaces
- `hooks/hooks.json` for hook registrations
- `skills/continuous-learning-v2/config.json` for observer config
- Relevant command, skill, or agent file

## Output Templates

### Short Recommendation

```text
Use <skill-or-command>. It fits because <reason>.

Canonical file: <path>
Verify with: <file-check-or-search>
Next: <one concrete action>
```

### Search Results

```text
Best matches:
- <path>: <why it matters>
- <path>: <why it matters>

Recommendation: <which one to use first and why>
```

### Agent Chain Recommendation

```text
Stack: <detected stack>
Risk: <low | medium | high>
Chain: <agent1> → <agent2> → <agent3>
Orchestrate with: plan-orchestrate
Command sequence: /gg:plan → /gg:<verify> → /gg:<review> → /gg:update-docs
```

## Related Surfaces

- `using-gg`: main GG routing workflow with full phase gates and routing table
- `workspace-surface-audit`: scan the local workspace for installed GG capabilities
- `repo-scan`: repository archaeology and structure discovery
- `plan-orchestrate`: convert a plan into per-step agent chains
- `team-builder`: compose ad-hoc parallel agent teams
- `gg-commands-reference.md`: slash command reference and recommended chains
