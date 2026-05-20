# Continuous Learning v2 Usage Guide

Continuous Learning v2 records Claude Code sessions through GG hooks, extracts small learned behaviors called instincts, and keeps those instincts scoped to the current project unless they prove useful across projects.

Use this guide when installing, validating, or operating the `continuous-learning-v2` skill in the GG plugin.

## What It Does

- Observes prompts and tool activity through `PreToolUse` and `PostToolUse` hooks.
- Detects the current project from `CLAUDE_PROJECT_DIR`, git remote URL, or git root path.
- Stores observations and instincts under `${XDG_DATA_HOME:-~/.local/share}/gg-homunculus`.
- Keeps project conventions project-scoped by default.
- Evolves related instincts into candidate skills, commands, or agents.
- Promotes instincts to global scope only when they appear with enough confidence across projects.

## Installation Modes

### GG Plugin Install

When installed as the GG plugin, no manual hook block is required. Claude Code loads `hooks/hooks.json`, and the plugin-managed hook invokes:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh
```

Do not also copy the hook into `~/.claude/settings.json`. Duplicate registration can cause double observation events and `${CLAUDE_PLUGIN_ROOT}` resolution errors.

### Manual Skill Install

If this skill is copied outside the GG plugin into `~/.claude/skills/continuous-learning-v2`, register the hook manually:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning-v2/hooks/observe.sh"
      }]
    }]
  }
}
```

## Configuration

Edit `config.json` to control the background observer:

```json
{
  "version": "2.1",
  "observer": {
    "enabled": false,
    "run_interval_minutes": 5,
    "min_observations_to_analyze": 20
  }
}
```

Recommended defaults:

- Keep `observer.enabled` as `false` to collect observations without running the background analyzer. Hooks still write samples; this flag only controls whether those samples are periodically analyzed into instincts.
- Turn `observer.enabled` to `true` after you have enough observations and want automatic instinct generation.
- Raise `min_observations_to_analyze` for noisy repositories.
- Set `CLV2_HOMUNCULUS_DIR` to an absolute path if the default local data directory is not appropriate.

## Basic Workflow

```bash
# 1. Work normally in a git repository with GG installed.
#    Hook observations are written automatically.

# 2. Confirm project detection and observation counts.
/gg:projects

# 3. Review learned project and global instincts.
/gg:instinct-status

# 4. Preview evolved artifacts from related instincts.
/gg:evolve

# 5. Generate candidate skills, commands, or agents when the preview is useful.
/gg:evolve --generate

# 6. Preview promotion from project scope to global scope.
/gg:promote --dry-run
```

## End-to-End Demo

Scenario: a Go service prefers table-driven tests.

1. The user asks Claude to add tests for several input cases.
2. Claude writes separate test functions.
3. The user corrects it: "Use table-driven tests here."
4. Claude rewrites the tests in the project style.
5. The hook records the prompt, edit, correction, and successful outcome in the current project scope.

After enough similar observations, the observer can create a project instinct:

```yaml
---
id: use-table-driven-tests
trigger: "when adding Go tests"
confidence: 0.7
domain: "testing"
scope: project
project_name: "billing-service"
---

# Use Table-Driven Tests

## Action
Prefer table-driven tests for Go test cases with multiple inputs or edge cases.

## Evidence
- User corrected separate test functions to a table-driven test.
- Pattern observed across multiple Go test edits in this project.
```

Then inspect it:

```bash
/gg:instinct-status
```

Expected shape:

```text
INSTINCT STATUS - 3 total
Project: billing-service (a1b2c3d4e5f6)

PROJECT-SCOPED
  testing  70%  use-table-driven-tests
           trigger: when adding Go tests

GLOBAL
  workflow 60%  grep-before-edit
           trigger: when modifying existing code
```

If related testing instincts cluster together, preview an evolved artifact:

```bash
/gg:evolve
```

Generate only after reviewing the proposal:

```bash
/gg:evolve --generate
```

If the same behavior appears in multiple projects with high confidence, preview promotion:

```bash
/gg:promote --dry-run
```

## Commands

| Command | Purpose |
| --- | --- |
| `/gg:projects` | List known project contexts and observation counts. |
| `/gg:instinct-status` | Show project-scoped and global instincts with confidence. |
| `/gg:evolve` | Cluster related instincts and suggest skills, commands, or agents. |
| `/gg:evolve --generate` | Write evolved artifacts under the project or global evolved directory. |
| `/gg:instinct-export` | Export selected instincts without raw observations. |
| `/gg:instinct-import <file>` | Import instincts from another source. |
| `/gg:promote [id]` | Promote one project instinct to global scope. |
| `/gg:promote --dry-run` | Preview promotion candidates without writing changes. |

## Data Layout

Default data root:

```bash
${XDG_DATA_HOME:-$HOME/.local/share}/gg-homunculus
```

Important paths:

```text
gg-homunculus/
|-- projects.json
|-- observations.jsonl
|-- instincts/
|   |-- personal/
|   `-- inherited/
|-- evolved/
|   |-- agents/
|   |-- skills/
|   `-- commands/
`-- projects/
    `-- <project-id>/
        |-- project.json
        |-- observations.jsonl
        |-- instincts/
        |   |-- personal/
        |   `-- inherited/
        `-- evolved/
            |-- agents/
            |-- skills/
            `-- commands/
```

## Scope Rules

- Use project scope for language conventions, framework patterns, file layout, and local code style.
- Use global scope for broad safety practices, general workflow preferences, and repeated behavior across multiple projects.
- Prefer `/gg:promote --dry-run` before writing global instincts.
- Do not promote raw one-off corrections; wait for repeated evidence.

## Troubleshooting

### No Observations Appear

Check that GG is installed as a plugin or that the manual hook block points to the correct `observe.sh` path.

For manual installs, verify the hook can run:

```bash
bash ~/.claude/skills/continuous-learning-v2/hooks/observe.sh
```

### Project Is Not Detected

Run commands from inside a git repository. If needed, set:

```bash
export CLAUDE_PROJECT_DIR=/absolute/path/to/project
```

### Duplicate Observations

Remove duplicate hook registration from `~/.claude/settings.json` when using the GG plugin. Plugin-managed hooks should be the only registration path.

### Too Many Weak Instincts

Increase `observer.min_observations_to_analyze` in `config.json`, then let the hook collect more evidence before evolving or promoting instincts.

## Privacy

- Raw observations remain local.
- Project-scoped instincts are isolated by project ID.
- Exports should contain instincts only, not raw observation logs.
- Review generated skills, commands, agents, and promoted instincts before relying on them.
