---
description: Navigate GG's skills, commands, agents, hooks, rules, and phase gates from the live plugin surface. Use to discover the right GG component for any Go, Python, database, security, or release workflow.
argument-hint: "[setup|skills|commands|agents|hooks|rules|chain|find: <query>|<feature-name>]"
---

# /gg:gg-guide

Use this command as a conversational map of the GG plugin. It helps the user discover the right GG surface for their task without dumping the entire README or a stale catalog.

## Usage

```text
/gg:gg-guide
/gg:gg-guide setup
/gg:gg-guide skills
/gg:gg-guide commands
/gg:gg-guide agents
/gg:gg-guide hooks
/gg:gg-guide rules
/gg:gg-guide chain
/gg:gg-guide find: <query>
/gg:gg-guide <feature-or-file-name>
```

## Operating Rules

1. Read current plugin files before answering when the repository is available.
2. Prefer current filesystem data over hard-coded lists or counts.
3. Keep the first answer short, then offer specific drill-down paths.
4. Link users to canonical files instead of copying long sections.
5. Do not invent commands, skills, agents, or hooks that are not present in the plugin.

## What To Inspect

Use these files as the canonical map:

- `README.md` for the plugin overview and P0/P1/P2 asset registry
- `gg-commands-reference.md` for slash command reference and recommended chains
- `plugin.json` for plugin metadata
- `commands/` for slash-command prompts
- `skills/*/SKILL.md` for reusable workflow skills
- `agents/*.md` for delegated subagent role prompts
- `hooks/hooks.json` for plugin lifecycle hook registration
- `rules/common/`, `rules/golang/`, `rules/python/` for workflow and language rules

When searching for a feature by name:

```bash
find skills -maxdepth 2 -name SKILL.md | sort
find commands -maxdepth 1 -name '*.md' | sort
find agents -maxdepth 1 -name '*.md' | sort
rg -n "<query>" skills commands agents rules
```

## Response Patterns

### No Arguments

Give a compact menu:

- understand what GG includes (P0, P1, P2 assets)
- choose a workflow: Go, Python, database, security, release
- pick skills, commands, or agents for a specific task
- understand phase gates and when to invoke each
- inspect hooks and rule sets
- find a specific feature by name or keyword

Then ask what they want to do next.

### `setup`

Explain how GG is structured as a plugin:

1. Point to `plugin.json`, `README.md`, and `hooks/hooks.json`.
2. Describe the P0/P1/P2 asset tiers.
3. Show the `.gg/` workspace convention for persistent artifacts.
4. Note that `continuous-learning-v2` is optional and disabled by default.

### `skills`

1. List skills grouped by tier (P0 delivery spine / P1 backend + security / P2 learning / extended).
2. Point to `skills/*/SKILL.md` as the canonical source.
3. Highlight the routing entry point: `using-gg`.
4. Suggest one drill-down based on context.

### `commands`

1. Summarize slash commands grouped by flow: main flow, Go, Python, database/security, continuous learning.
2. Point to `gg-commands-reference.md` for the full reference and recommended chains.
3. Avoid exhaustive lists; suggest the chain most relevant to context.

### `agents`

1. List agents grouped by role: planning, build/fix, review, documentation/ops.
2. Explain the HANDOFF protocol: each agent closes with a structured HANDOFF that feeds the next.
3. Point to the agent chain patterns in `gg-commands-reference.md`.
4. Mention `/gg:orchestrate` for running chains.

### `hooks`

1. Summarize the hook dispatch architecture:
   - `hooks/hooks.json` → `scripts/hooks/skill-hook-dispatcher.js`
   - Only skills with their own `hooks/hooks.json` are executed
   - Currently only `continuous-learning-v2` declares hook entries
2. Explain the observer default: `observer.enabled=false` in `config.json`.
3. Warn against registering `observe.sh` manually to avoid double-capture.

### `rules`

1. Describe the three rule scopes: `common/`, `golang/`, `python/`.
2. List the rule files in each scope.
3. Explain that rules are passive guidance loaded into the AI harness context; they complement skills and agents but do not replace them.

### `chain`

1. Show the recommended agent chains from `gg-commands-reference.md`:
   - Go feature: `planner → tdd-guide → go-build-resolver → go-reviewer → security-reviewer → doc-updater`
   - Python feature: `planner → tdd-guide → build-error-resolver → python-reviewer → security-reviewer → doc-updater`
   - Database: add `database-reviewer`, `database-migrations`, relevant DB pattern skill
   - Release: add `verification-loop`, `deployment-patterns`, `docker-patterns`
2. Note that `plan-orchestrate` converts a chain into ready-to-run orchestration prompts.
3. Show the corresponding command sequence for the most likely chain.

### Search Mode (`find: <query>`)

1. Search `skills/`, `commands/`, `agents/`, and `rules/` with `rg`.
2. Group results by surface type.
3. Return the strongest matches first with file paths.
4. Recommend the next action for each match.

### Feature Lookup (`<feature-name>`)

1. Check exact paths first: `skills/<name>/SKILL.md`, `commands/<name>.md`, `agents/<name>.md`.
2. If exact lookup fails, search with `rg -n "<name>" skills commands agents`.
3. Explain what the feature does, when to use it, and its canonical file path.
4. Mention the phase gate where it applies and adjacent features only when they reduce confusion.

## Related Commands

- `/gg:plan` for requirement restatement, risk assessment, and plan confirmation
- `/gg:orchestrate` for running sequential agent chains
- `/gg:quality-gate` for evidence gates after implementation
- `/gg:security-scan` for security-oriented review workflow
- `/gg:checkpoint` for creating and listing workflow checkpoints
