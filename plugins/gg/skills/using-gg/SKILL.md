---
name: using-gg
description: Use when starting, continuing, verifying, reviewing, or closing Go, Python, database, security-sensitive, or release-bound software delivery work with gg-plugins.
origin: GG
---

# Using GG

## Overview

Use GG as a lightweight delivery spine for Go and Python backend work. This skill routes the task to the right GG skills, agents, and commands, then enforces phase gates so work does not jump from vague requirements straight to code.

Core principle: **route first, plan before code, prove every phase with evidence.**

## When to Use

Use this skill for:
- New Go or Python features
- Bug fixes or refactors that touch production code
- Database migrations, schema changes, SQL, or connection-pool changes
- Authentication, authorization, secrets, user input, or sensitive data handling
- Release-bound work that needs verification, docs, branch, or PR readiness

Do not use this skill for:
- Tiny explanations with no code or workflow artifact
- One-off questions about what GG contains; use `workspace-surface-audit` or a guide-style answer instead
- Pure repository archaeology; use `repo-scan`

## Phase Gates

Never skip a gate silently. If a gate is not relevant, say why.

| Phase | Goal | GG surface | Gate evidence |
|---|---|---|---|
| 0. Route | Choose the path | `workspace-surface-audit`, `iterative-retrieval` (when relevant files or project terminology are unclear), `context-budget` (when many skills/MCPs are loaded), project files, language markers | stack, risk, chosen path, context headroom |
| 1. Clarify and plan | Restate requirements, risks, steps | `/gg:plan`, `planner`, `architect`; invoke `council` when the task has multiple credible design paths with real tradeoffs — run before the plan is locked | confirmed plan or explicit user approval |
| 2. Orchestrate | Turn plan into agent chains when multi-step | `plan-orchestrate` (use `iterative-retrieval` when a step would otherwise guess its code context; run `context-budget` first if the chain is long or context is tight) | per-step chain or reason not needed |
| 3. TDD and small implementation | Make one behavior pass at a time | `tdd-workflow`, `tdd-guide`, language testing skills | RED failure, GREEN pass, refactor pass |
| 4. Build and verification | Prove the implementation works | `verification-loop`, `/gg:go-build`, `/gg:build-fix`, `/gg:test-coverage`, `/gg:quality-gate` | commands run and results |
| 5. Review | Catch quality, security, domain issues | reviewer agents, `/gg:go-review`, `/gg:python-review`, `/gg:code-review`, `security-review`; invoke `santa-method` when output is security-sensitive, contains a database migration, or will be released as a public API — run after verification-loop, before closeout | findings resolved or explicitly accepted; santa NICE verdict if applied |
| 6. Docs and closeout | Prepare handoff, branch, PR, release notes | `/gg:update-docs`, `doc-updater`, `/gg:rag-sync` (if `.rag/` exists), `git-workflow`, `deployment-patterns` | docs status, git/PR readiness, residual risk |
| F. Failure recovery (any phase) | Diagnose loops, drift, repeated retries | `agent-introspection-debugging` (capture → diagnose → contained recovery → report) | introspection report with root cause and recovery action |

## Routing Rules

Start by classifying the task. Multiple routes may apply.

| Signal | Required route |
|---|---|
| Go files, `go.mod`, goroutines, channels, Go API | `golang-patterns`, `golang-testing`, `/gg:go-test`, `/gg:go-build`, `/gg:go-review`, `go-reviewer` |
| Python files, `pyproject.toml`, `requirements.txt`, pytest, ruff, mypy | `python-patterns`, `python-testing`, `tdd-workflow`, `/gg:build-fix`, `/gg:python-review`, `python-reviewer` |
| SQL, migrations, indexes, schema, connection pools | `database-migrations`, `postgres-patterns` or `mysql-patterns`, `database-reviewer` |
| Auth, secrets, user input, payment, PII | `security-review`, `security-reviewer`, `/gg:security-scan` when config surfaces matter |
| Docker, deployment, release, rollback | `docker-patterns`, `deployment-patterns`, `verification-loop`, `git-workflow` |

## Standard Workflow

1. **Route.** Identify stack, risk level, and the minimum GG path. If the user asked for code and requirements are unclear, ask before planning.
2. **Plan.** Use `/gg:plan` for new features, significant refactors, or multi-file changes. Do not write production code before the plan is confirmed.
3. **Orchestrate multi-step work.** If the plan has multiple independent or high-risk steps, use `plan-orchestrate` to produce per-step agent chains. Use `iterative-retrieval` before dispatching an agent when the relevant files, local terminology, or evidence are not yet clear; pass objective context, high-relevance evidence, missing context, and constraints in the handoff. Before relying on those chains, confirm the local environment can actually run the emitted orchestration form. If orchestration is unavailable, execute the steps sequentially and preserve the same gates. Skip orchestration only for narrow single-step work and state why.
4. **Implement in small TDD loops.** Use `tdd-workflow` plus language-specific testing guidance. For Go, prefer `/gg:go-test`. For Python, explicitly run the pytest/coverage equivalent because GG does not yet provide `/gg:python-test`.
5. **Fix build failures narrowly.** Use `/gg:go-build` for Go and `/gg:build-fix` for other stacks. Keep fixes minimal; do not turn build repair into architecture work.
6. **Verify.** Run `verification-loop` or the closest project-specific checks. Record exact commands and outcomes.
7. **Review.** Use language/framework reviewers and `security-reviewer` or `database-reviewer` when the route requires them. Do not proceed to closeout with unresolved critical or high findings.
8. **Close out.** Update docs when behavior, setup, APIs, or operations changed. Use `git-workflow` for branch, commit, PR description, and release notes. If `.rag/_manifest.json` exists, run `/gg:rag-sync` to incrementally update the RAG knowledge base (surgical git-diff-driven update, not a full rebuild). If live GitHub PR/CI operations are needed, GG's base surface is not enough; use the `github-ops` skill or project-native tooling.

## Stop Conditions

Stop and report instead of pushing forward when:
- Requirements conflict or no acceptance criteria can be stated
- The user has not approved a plan for broad code changes
- TDD RED was not observed before implementation
- Build, tests, coverage, or security checks fail after reasonable focused fixes
- A database migration lacks rollback or production-size safety analysis
- Multi-step orchestration is requested but no usable orchestrator or agent registration is available
- A PR/CI/release action requires GitHub operations not present in GG's base plugin

## Common Mistakes

| Mistake | Fix |
|---|---|
| Starting implementation because the user sounded certain | Route and plan first when scope is multi-file or risky |
| Treating `plan-orchestrate` as execution | It only emits prompts; still manage gates and evidence |
| Passing only a literal task to a subagent | Use `iterative-retrieval` and include objective, evidence, missing context, and constraints |
| Reviewing before verification | Run build/test/coverage checks first so reviewers inspect proven code |
| Using generic review for database or security work | Add `database-reviewer` or `security-reviewer` |
| Claiming PR-ready without CI or branch evidence | Report "locally verified" unless PR/CI state was actually checked |

## Extended GG Skills

GG includes a small set of extended skills for workflows that go beyond the core Go/Python delivery path:

- `gg-guide` for navigating GG's skills, commands, agents, hooks, and rules
- `github-ops` for live PR management, CI checks, releases, issue triage, and GitHub security alerts
- `team-builder` for composing ad-hoc parallel agent teams from available GG or user agents
- `terminal-ops` for evidence-first command execution, CI/build debugging, git-state inspection, and narrow repo fixes
- `iterative-retrieval` for progressive context discovery and structured handoffs before dispatching agents into unfamiliar code
- `context-budget` for token-overhead audits across agents/skills/rules/MCP/CLAUDE.md (run before adding new components or composing long orchestration chains)
- `agent-introspection-debugging` for the 4-phase agent self-debug SOP whenever a step loops, drifts, or stalls

Optional observability and eval skills (install via `capability:observability`):

- `enterprise-agent-ops` for long-lived / cloud-hosted agent workloads (lifecycle, success-rate / mean-retries / time-to-recovery / cost-per-task metrics, incident pattern)
- `eval-harness` for eval-driven development with `pass@k` / `pass^k` metrics (recommended gate before `/gg:promote` and for release-critical paths)

Use these skills directly when the user's prompt depends on their surface. If the workflow depends on external services such as GitHub, Context7, Playwright, or an MCP server, first confirm the required tool or MCP is available in the active environment.
