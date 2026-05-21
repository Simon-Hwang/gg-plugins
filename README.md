# gg-plugins

`gg-plugins` is a Claude Code plugin suite for lean Go and Python software delivery. It provides a curated subset of agents, skills, commands, and rules optimised for backend Go and Python codebases.

```text
requirements -> design -> tasks -> coding -> tests -> verification -> review -> docs -> observability -> release/rollback
```

The first version is intentionally Claude Code only. It does not implement a full multi-harness agent platform or external CI/monitoring integration. It includes default guard hooks plus optional continuous-learning-v2 observation hooks.

## What It Provides

- `plugins/gg/commands`: slash commands such as `/gg:plan`, `/gg:tdd`, `/gg:build-fix`, `/gg:review`, `/gg:ship`, `/gg:security-scan`, and `/gg:update-docs`.
- `plugins/gg/skills`: workflow skills for orchestration, TDD, verification, security, repo scanning, Go/Python patterns, git workflow, deployment, Docker, and optional continuous learning.
- `plugins/gg/agents`: agents for planning, architecture, TDD, Go/Python review, build resolution, security, documentation, and database review.
- `plugins/gg/rules`: common, Go, and Python rules.
- `plugins/gg/hooks`: default guard hooks plus skill lifecycle dispatch for optional continuous-learning observation.

## Design Principles

- Keep the workflow generic: no company-specific terminology, private SDKs, private background-task backends, or proprietary project layout.
- Optimize the default path for Go and Python codebases.
- Use `plan-orchestrate` for a superpowers-style pushed-task workflow.
- Prefer curated, proven workflow files over creating new GG-specific alternatives.
- Keep `.gg/` as an optional project workspace only if a future GG-specific workflow needs it.
- Keep runtime hooks narrow and deterministic: default guard hooks cover compact reminders, lightweight quality checks, config protection, and fact-forcing; heavier automation stays opt-in.

## Quick Start

### Pick one path only

GG has two install paths — choose one and stick to it:

- **Plugin path (recommended):** install via `claude plugin`, then copy only the rule packs you need.
- **Selective installer path:** use `install.sh` for fine-grained control or when you want to skip the plugin system entirely.

> **Do not stack both paths.** Running `install.sh --profile full` after a plugin install duplicates skills, commands, and hooks and can cause double-firing hooks.

### Plugin path (recommended)

```bash
# Step 1 — register the local marketplace
claude plugin marketplace add /path/to/gg-plugins

# Step 2 — install the plugin
claude plugin install gg@gg-marketplace
```

Once installed, Claude Code v2.1+ automatically loads:

- **Skills** and **commands** — declared in `plugin.json`
- **Hooks** — `hooks/hooks.json` loaded by convention
- **Agents** — `agents/` discovered by convention

GG follows the ECC Claude Code pattern for MCPs: plugin installs intentionally do not auto-enable bundled MCP server definitions. This keeps the default context surface small and avoids surprising external tool activation.

For live third-party documentation lookup, enable Context7 manually with Claude Code `/mcp`, or copy the pinned `context7` entry from `plugins/gg/mcp-configs/mcp-servers.json` into a project-scoped `.mcp.json`.

**Rules are not auto-loaded** (Claude Code plugin limitation). After the plugin install, copy only the language packs you need:

```bash
mkdir -p ~/.claude/rules/gg
cp -R /path/to/gg-plugins/plugins/gg/rules/common ~/.claude/rules/gg/
cp -R /path/to/gg-plugins/plugins/gg/rules/python ~/.claude/rules/gg/   # Python projects
cp -R /path/to/gg-plugins/plugins/gg/rules/golang ~/.claude/rules/gg/   # Go projects
```

Claude Code auto-loads all `.md` files under `~/.claude/rules/` — no extra config needed.

### Selective installer path (manual / fine-grained)

Use this when you want to skip the plugin system, control exactly which components are installed, or minimise context load.

```bash
git clone https://github.com/your-org/gg-plugins.git
cd gg-plugins

# Preview first (no files written)
./install.sh --profile python --dry-run

# Install
./install.sh --profile python
```

**Available profiles:**

| Profile | Modules | Description |
|---|---|---|
| `minimal` | 4 | Rules + agents + commands + workflow skills. No hooks. |
| `core` | 5 | `minimal` + hook dispatcher. |
| `go` | 8 | `core` + Go rules/skills + security. |
| `python` | 8 | `core` + Python rules/skills + security. |
| `full` | 17 | Everything. |

**Customise with `--with` / `--without`:**

```bash
# Add components to a profile
./install.sh --profile core --with lang:python --with capability:database

# Remove components from full
./install.sh --profile full --without capability:learning --without capability:extended

# Install individual skills only
./install.sh --skills continuous-learning-v2,autonomous-loops
```

**Available component families:**

| Family | Examples |
|---|---|
| `baseline:*` | `baseline:rules`, `baseline:agents`, `baseline:hooks` |
| `lang:*` | `lang:python`, `lang:go` |
| `capability:*` | `capability:security`, `capability:database`, `capability:devops`, `capability:agentic`, `capability:learning`, `capability:observability`, `capability:rag`, `capability:extended` |

```bash
# Discover what's available
./install.sh --list-profiles
./install.sh --list-modules
./install.sh --list-components --family capability
```

### What each path installs (selective installer, Claude Code target)

| Source | Destination |
|---|---|
| `plugins/gg/rules/common` | `~/.claude/rules/gg/common` |
| `plugins/gg/rules/python` | `~/.claude/rules/gg/python` |
| `plugins/gg/rules/golang` | `~/.claude/rules/gg/golang` |
| `plugins/gg/skills/<name>` | `~/.claude/skills/gg/<name>` |
| `plugins/gg/agents` | `~/.claude/agents` |
| `plugins/gg/commands` | `~/.claude/commands` |
| `plugins/gg/hooks` + `scripts` | merged into `~/.claude/settings.json` + copied to `~/.claude/plugins/gg/` |

### First command

```text
/gg:plan
```

## Documentation

See `plugins/gg/README.md` and `plugins/gg/gg-commands-reference.md` for the command map and workflow details.

See `TROUBLESHOOTING.md` for common install issues.
