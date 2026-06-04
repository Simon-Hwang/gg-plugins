# GG Plugin — Agent Instructions

This is a **lean Claude Code plugin** for Go and Python software delivery, providing specialized agents, skills, commands, and automated hook workflows for the full requirement-to-release workflow.

**Version:** 0.1.0

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks
2. **Test-Driven** — Write tests before implementation, 80%+ coverage required
3. **Security-First** — Never compromise on security; validate all inputs
4. **Plan Before Execute** — Plan complex features before writing code
5. **Research Before Build** — Search GitHub, docs, and registries before writing new code

## Available Agents

### Planning & Architecture

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning and task breakdown | Complex features, refactoring |
| architect | System design and scalability decisions | Architectural decisions |
| code-architect | Feature architecture blueprints based on codebase patterns | New feature design |
| code-explorer | Traces execution paths and maps architecture layers | Understanding existing code |

### Code Quality & Review

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| code-reviewer | Code quality and maintainability review | After writing/modifying code |
| code-simplifier | Simplifies code for clarity and consistency | Code cleanup, post-implementation |
| silent-failure-hunter | Detects swallowed errors and missing error propagation | Error handling audits |
| pr-test-analyzer | Reviews PR test coverage quality and completeness | Before merging PRs |
| refactor-cleaner | Dead code and duplicate cleanup | Code maintenance |

### Test-Driven Development

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| tdd-guide | Test-driven development workflow | New features, bug fixes |
| e2e-runner | End-to-end Playwright testing | Critical user flows |

### Language-Specific Reviewers

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| go-reviewer | Go idiomatic style, concurrency patterns | Go projects |
| python-reviewer | Python style, type hints, and backend conventions | Python projects |

### Build Error Resolvers

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| build-error-resolver | Generic multi-language build error fixing | Non-specific build failures |
| go-build-resolver | Go build, go vet, golangci-lint | Go build failures |
| pytorch-build-resolver | PyTorch/CUDA, pip dependency errors | ML/Python build failures |

### Security & Performance

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| security-reviewer | Vulnerability detection and security analysis | Before commits, sensitive code |
| performance-optimizer | Go/Python backend performance profiling and optimization | Slow handlers, latency regressions |

### Data & Infrastructure

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| database-reviewer | PostgreSQL/MySQL schema, migration, query review | DB migrations, SQL changes |

### Documentation & Operations

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| doc-updater | Standard docs (README, runbook, codemap) + RAG incremental sync (git-diff-driven `.rag/` update when `_manifest.json` exists) | After code changes; invoked by /gg:update-docs and /gg:rag-sync |
| docs-lookup | Third-party library API lookup via Context7 | Researching library APIs |

### Autonomous & Orchestration

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| loop-operator | Long-running autonomous loop execution | Background tasks, autonomous loops |
| harness-optimizer | Agent harness configuration tuning | Reliability, cost, throughput |

### Adversarial Verification & Decision Council

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| santa-method | Dual independent reviewer agents with verdict gate and convergence loop | Before shipping production code, migrations, or public APIs; when semantic correctness matters beyond build/lint/test |
| council | Four-voice adversarial decision council (Architect + Skeptic + Pragmatist + Critic) | Ambiguous architecture/strategy decisions with multiple credible paths; when conversational anchoring is a risk |

## Agent Orchestration

Use agents proactively without user prompt:

- Complex feature requests → **planner** then **code-architect**
- Exploring unfamiliar code → **code-explorer** first
- Code just written/modified → **code-reviewer** then **code-simplifier**
- Bug fix or new feature → **tdd-guide**
- Architectural decision → **architect**
- Security-sensitive code → **security-reviewer**
- Performance regression → **performance-optimizer**
- Silent errors suspected → **silent-failure-hunter**
- Before merging PR → **pr-test-analyzer**
- Autonomous loops / monitoring → **loop-operator**
- Shipping to production / critical output → **santa-method** (after verification-loop)
- Ambiguous decision with multiple credible paths → **council**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Recommended Agent Chains

```
Go feature:        planner → tdd-guide → go-build-resolver → go-reviewer → security-reviewer → doc-updater
Python feature:    planner → tdd-guide → build-error-resolver → python-reviewer → security-reviewer → doc-updater
DB-impacting:      planner → database-reviewer → tdd-guide → go-reviewer/python-reviewer → doc-updater
Release work:      code-reviewer → security-reviewer → pr-test-analyzer → [santa-method] → doc-updater
High-stakes:       verification-loop → santa-method (semantic dual-review) → doc-updater
Architecture call: council (pick the path) → architect (design) → planner (break down)
RAG bootstrap:     (one-time) /gg:build-rag
RAG maintenance:   (after each feature) doc-updater [RAG Sync Mode] via /gg:rag-sync
```

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- Authentication/authorization verified
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager.

**If security issue found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets.

## Coding Style

**File organization:** Small, focused files. 200–400 lines typical, 800 max. Organize by feature/domain.

**Error handling:** Handle errors at every level. Never silently swallow errors. Use silent-failure-hunter to audit.

**Input validation:** Validate all user input at system boundaries. Fail fast with clear messages.

## Testing Requirements

**Minimum coverage: 80%**

**TDD workflow (mandatory):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

## Development Workflow

1. **Research** — GitHub search, library docs, package registries before writing code
2. **Plan** — Use planner agent, identify dependencies and risks, break into phases
3. **Explore** — Use code-explorer to understand existing patterns before implementing
4. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
5. **Review** — Use code-reviewer agent immediately, address CRITICAL/HIGH issues
6. **Commit** — Conventional commits format, comprehensive PR summaries

## Workflow Surface Policy

- `skills/` is the canonical workflow surface for new contributions.
- `commands/` provides slash-entry UX. A command is one of three shapes:
  1. **Thin shortcut** — a pointer to a single agent (e.g. `/gg:security-scan` → `security-reviewer`).
     The command file carries no independent workflow knowledge; renaming or
     removing the agent only requires updating the pointer text.
  2. **Inline workflow** — the prompt body IS the workflow (e.g. `/gg:plan`,
     `/gg:review`, `/gg:tdd`). Agents may or may not be invoked from inside it.
  3. **Subsystem CLI** — wraps a script under `skills/<x>/scripts/`
     (e.g. `/gg:learn`, `/gg:evolve` → `continuous-learning-v2` CLI).
- `agents/` defines specialized subagents for delegation. An agent does NOT need a
  paired command; it can be reached via Task delegation, orchestration chains
  (`/gg:orchestrate custom "<agent>,..." "<task>"`), or implicit
  description-based triggering.
- `rules/` contains always-follow guidelines per language and domain.

There is no 1:1 contract between agents and commands. The only hard invariant is
that a **thin-shortcut** command must reference an agent that actually exists.
Inline-workflow and subsystem-CLI commands stand on their own.

## Project Structure

```
agents/          — specialized subagents
skills/          — workflow skills and domain knowledge
commands/        — slash commands
hooks/           — Trigger-based automations (continuous-learning-v2)
rules/           — Always-follow guidelines (common + golang + python)
scripts/         — Node.js hook utilities
```

## Doc Sync Requirement

The doc-sync rule is intentionally narrow. It is **not** a "update four files
for every rename" mandate.

**When you rename or remove an agent:**
- Grep for the old name under `commands/` and update any thin-shortcut command
  that references it. That is the only hard requirement.
- Optionally update the `## Available Agents` tables in this file and the
  Skills table in `CLAUDE.md` if those tables list the agent by name.

**When you add a new agent:**
- Ensure its YAML frontmatter (`name`, `description`, `tools`, `model`) is
  valid; the description must clearly tell Claude when to invoke it.
- Listing it in `AGENTS.md` is encouraged but not required for it to work.

**When you add, rename, or remove a skill:**
- Update the relevant `paths` array in `manifests/install-modules.json` so the
  selective installer does not silently omit the skill.
- If the skill introduces a new selectable capability, update
  `manifests/install-components.json`.
- If it belongs in the complete install, update `manifests/install-profiles.json`.

**When you add, rename, or remove a command:**
- No install manifest update is needed for individual command files because
  `commands-core` bulk-copies `commands/`.
- For thin-shortcut commands, verify the referenced agent still exists.

**When you update Codex compatibility:**
- Keep `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`,
  `.mcp.json`, and the `codex-*` adapter skills aligned.
- Update `skills-codex-adapters` in `manifests/install-modules.json` when adding
  or removing Codex adapter skills.

See `.claude/rules/doc-sync.md` for additional notes. Avoid maintaining parallel
agent/command tables across four files just to keep them in lockstep.
