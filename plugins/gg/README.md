# GG Plugin

`gg` is a lean Claude Code development-flow plugin optimised for Go and Python requirement/code development.

## Source Policy

The files under `agents/`, `commands/`, `skills/`, and `rules/` follow a curated baseline. Prefer proven workflow files over creating new GG-specific alternatives.

## Core Flow

0. `using-gg` routes Go/Python backend work through the right GG skills, agents, commands, and phase gates.
1. `/gg:plan` creates a plan and waits for confirmation.
2. `plan-orchestrate` converts a plan into per-step agent chains.
3. `planner`, `architect`, and `tdd-guide` drive requirement breakdown, design, and test-first implementation.
4. Go work uses `/gg:go-build`, `/gg:go-test`, `/gg:go-review`, `go-build-resolver`, and `go-reviewer`.
5. Python work uses `/gg:python-review`, `python-reviewer`, and the generic `build-error-resolver` for failing checks.
6. DB-impacting work uses `database-reviewer`, `database-migrations`, `postgres-patterns`, or `mysql-patterns`.
7. `/gg:quality-gate`, `/gg:test-coverage`, `/gg:security-scan`, and `verification-loop` provide evidence gates.
8. `/gg:update-docs`, `doc-updater`, `deployment-patterns`, and `docker-patterns` support documentation and release readiness.

## P0 Assets

P0 is the stable Go/Python requirement-development spine:

- Agents: `planner`, `architect`, `tdd-guide`, `go-reviewer`, `go-build-resolver`, `python-reviewer`, `build-error-resolver`, `code-reviewer`
- Skills: `using-gg`, `plan-orchestrate`, `iterative-retrieval`, `tdd-workflow`, `verification-loop`, `context-budget`, `agent-introspection-debugging`, `golang-patterns`, `golang-testing`, `python-patterns`, `python-testing`
- Rules: `rules/common`, `rules/golang`, `rules/python`
- Commands: `/gg:plan`, `/gg:go-build`, `/gg:go-test`, `/gg:go-review`, `/gg:python-review`, `/gg:quality-gate`

## P1 Assets

P1 completes backend engineering, security, documentation, and release readiness:

- Agents: `security-reviewer`, `doc-updater`, `database-reviewer`
- Skills: `security-review`, `security-scan`, `repo-scan`, `workspace-surface-audit`, `search-first`, `git-workflow`, `database-migrations`, `postgres-patterns`, `mysql-patterns`, `deployment-patterns`, `docker-patterns`
- Commands: `/gg:security-scan`, `/gg:code-review`, `/gg:test-coverage`, `/gg:harness-audit`, `/gg:update-docs`, `/gg:checkpoint`

## P2 Observability & Eval (Optional)

GG ships two opt-in skills for agent observability and quality gates. Install via `capability:observability` (`skills-observability` module, `defaultInstall: false`).

- Skill: `enterprise-agent-ops` — long-lived / cloud-hosted agent lifecycle, baseline controls (immutable artifacts, least-privilege creds, hard timeout / retry budgets, audit log), tracked metrics (success rate, mean retries, time to recovery, cost per successful task, failure class distribution), and a 6-step incident pattern.
- Skill: `eval-harness` — eval-driven development with capability + regression evals, code/model/human graders, and `pass@k` / `pass^k` reliability metrics. Recommended thresholds: capability evals `pass@3 >= 0.90`, regression evals `pass^3 = 1.00` for release-critical paths.
- Pairings:
  - `continuous-learning-v2` — gate `/gg:promote` on `eval-harness` `pass^3 = 100%` instead of confidence alone.
  - `verification-loop` — deterministic graders (build/test/lint/security); `eval-harness` adds behavior-quality graders that unit tests cannot express.
  - `agent-introspection-debugging` — failure that recurs across multiple eval runs is high-signal evidence for an instinct or skill change.

## P2 Continuous Learning

GG includes `continuous-learning-v2` as an optional learning-governance layer:

- Skill: `continuous-learning-v2`
- Commands: `/gg:learn`, `/gg:learn-eval`, `/gg:instinct-status`, `/gg:evolve`, `/gg:instinct-export`, `/gg:instinct-import`, `/gg:promote`, `/gg:projects`
- Hooks: `hooks/hooks.json` registers GG default guard hooks (`suggest-compact`, `PreCompact`, `quality-gate`, `gateguard-fact-force`, `config-protection`) and the generic skill hook dispatcher.
- Runtime scripts: `scripts/hooks/skill-hook-dispatcher.js`, `scripts/hooks/observe-runner.js`, `scripts/hooks/run-with-flags.js`, `scripts/hooks/*gate*.js`, `scripts/hooks/*compact*.js`, `scripts/lib/hook-flags.js`

When installed as a Claude Code plugin, Claude Code v2.1+ should auto-load `hooks/hooks.json` by convention. Do not also add `skills/continuous-learning-v2/hooks/observe.sh` manually to `~/.claude/settings.json`, or observations may be captured twice.

The observer is conservative by default: `skills/continuous-learning-v2/config.json` has `observer.enabled=false`. Hooks can still capture observations; automated background analysis requires explicitly enabling/configuring the observer.

Default guard hooks run directly from `hooks/hooks.json` when the plugin is installed. Skill hooks are registered through the generic dispatcher in `scripts/hooks/skill-hook-dispatcher.js`; skills can add their own `skills/<skill>/hooks/hooks.json` entries, and `continuous-learning-v2` uses that path for observation.

### MCP Templates

Claude Code plugin installs keep `plugin.json` `mcpServers` empty, following the ECC pattern: GG does not auto-enable bundled MCP servers. This avoids unexpected external tool activation and keeps the default context surface small.

For `docs-lookup` and `documentation-lookup`, enable Context7 manually with Claude Code `/mcp`, or copy the pinned `context7` entry from `mcp-configs/mcp-servers.json` into a project-scoped `.mcp.json`.

### Hook Runtime Controls

Claude Code plugin installs load `hooks/hooks.json` as a whole; install profiles only apply to the selective `install.sh` path. Use environment variables to control which registered hooks actually run:

| Variable | Default | Effect |
|---|---|---|
| `GG_HOOK_PROFILE` | `standard` | Enables hooks whose profile list includes `minimal`, `standard`, or `strict`. Set `minimal` for low-friction/cloud runs. |
| `GG_DISABLED_HOOKS` | _(empty)_ | Comma-separated hook IDs to skip, for example `pre:edit-write:gateguard-fact-force`. |
| `GG_GATEGUARD` | enabled | Set to `off`, `0`, `false`, `disabled`, or `disable` to bypass GateGuard. |
| `GG_QUALITY_GATE_FIX` | `false` | Set `true` to let `quality-gate` auto-format supported files instead of only checking. |
| `GG_QUALITY_GATE_STRICT` | `false` | Set `true` to emit stricter quality-gate failure messages. |
| `GG_COMPACT_THRESHOLD` | `50` | Tool-call count before `suggest-compact` prints its first reminder. |
| `GG_SKIP_OBSERVE` | `0` | Set `1` to skip `continuous-learning-v2` observation hooks. |
| `GG_OBSERVE_SKIP_PATHS` | `observer-sessions,.claude-mem` | Comma-separated path fragments that observation hooks ignore. |
| `GG_OBSERVER_SIGNAL_EVERY_N` | `20` | Observation count interval for signaling the background observer. |
| `GG_PLUGIN_ROOT` / `CLAUDE_PLUGIN_ROOT` | auto-detected | Override plugin root path for custom installs or debugging. |

For unattended cloud execution, prefer `GG_HOOK_PROFILE=minimal` or explicitly disable high-friction hooks such as GateGuard with `GG_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force`.

## Task Push Flow

Use the `plan-orchestrate` skill as the task-push bridge. It reads a plan, decomposes it into steps, selects agent chains from the GG catalogue, and emits ready-to-run orchestration prompts. Use `iterative-retrieval` before dispatching an agent when the step needs codebase context that is not yet obvious; pass objective context, high-relevance evidence, missing context, and constraints forward as handoff material.

Recommended chains:

- Go feature: `planner -> tdd-guide -> go-build-resolver -> go-reviewer -> security-reviewer -> doc-updater`
- Python feature: `planner -> tdd-guide -> build-error-resolver -> python-reviewer -> security-reviewer -> doc-updater`
- DB-impacting work: add `database-reviewer`, `database-migrations`, and the relevant DB pattern skill
- Release-sensitive work: add `verification-loop`, `deployment-patterns`, and `docker-patterns`

## Workspace Convention

When persistent artifacts are useful, write them under `.gg/` in the target project:

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

Do not create `.gg/` artifacts for tiny one-off explanations unless the user asks for persistent output.

## First-Version Boundaries

Included:

- Selected commands, skills, agents, and rules for Go/Python development.
- Planning, TDD, verification, review, security, documentation, and release-readiness assets.
- Default guard hooks plus optional continuous-learning-v2 observation hooks and instinct management commands.
- Context7 MCP template for opt-in live public documentation lookup.

Deferred:

- Automatic MCP setup.
- Cursor/Codex/OpenCode adapters.
- Full multi-harness marketplace/npm platform scope.

See `future-expansion.md` for staged second-phase ideas.
