# Troubleshooting

Common issues and solutions for the `gg` Claude Code plugin.

## Table of Contents

- [Plugin Not Loading](#plugin-not-loading)
- [Hook Errors](#hook-errors)
- [Continuous Learning Issues](#continuous-learning-issues)
- [Context Window Overflow](#context-window-overflow)
- [Runtime Requirements](#runtime-requirements)
- [Common Error Messages](#common-error-messages)

---

## Plugin Not Loading

**Symptom:** `/gg:plan` or other `gg:` commands are not recognised.

**Solutions:**

```bash
# Verify the plugin cache contains the gg plugin
ls ~/.claude/plugins/cache/

# Confirm agents and skills are present
ls ~/.claude/plugins/cache/*/agents/
ls ~/.claude/plugins/cache/*/skills/

# Reload the plugin
# Claude Code → Settings → Extensions → Reload

# Check Claude Code version (requires 2.0+)
claude --version
```

If using a manual install, ensure the `plugins/gg` directory is placed in the correct Claude Code plugin path and the plugin is enabled in settings.

---

## Hook Errors

**Symptom:** Hooks do not fire, or the hook dispatcher logs an error.

```bash
# Check hooks are registered
grep -A 10 '"hooks"' ~/.claude/settings.json

# Verify hook scripts are executable
chmod +x ~/.claude/plugins/cache/*/scripts/hooks/*.js
chmod +x ~/.claude/plugins/cache/*/skills/continuous-learning-v2/hooks/*.sh

# Check that Node.js is available (required by hook scripts)
node --version

# Test the skill-hook-dispatcher manually
echo '{}' | node ~/.claude/plugins/cache/*/scripts/hooks/skill-hook-dispatcher.js
```

**Control env vars (optional overrides):**

| Variable | Default | Purpose |
|---|---|---|
| `GG_HOOK_PROFILE` | `standard` | Set to `minimal`, `standard`, or `strict` |
| `GG_DISABLED_HOOKS` | _(none)_ | Comma-separated hook IDs to skip |
| `GG_PLUGIN_ROOT` | auto-detected | Override plugin root path |

---

## Continuous Learning Issues

**Symptom:** Observations are not recorded, or `/gg:instinct-status` shows no data.

```bash
# Check observer is enabled
cat ~/.claude/plugins/cache/*/skills/continuous-learning-v2/config.json
# observer.enabled must be true to run background analysis;
# hooks still capture observations even when false.

# Verify observation files exist
# Data is stored under gg-homunculus (v2.1+); CLV2_HOMUNCULUS_DIR overrides the default.
ls "${XDG_DATA_HOME:-$HOME/.local/share}/gg-homunculus/projects/"*/observations.jsonl

# Find the current project hash
python3 - <<'PY'
import json, os
base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
registry = os.path.join(base, "gg-homunculus", "projects.json")
with open(registry) as f:
    data = json.load(f)
for pid, meta in data.items():
    if meta.get("root") == os.getcwd():
        print(pid)
        break
else:
    raise SystemExit("Project not found in registry")
PY

# View recent observations
tail -20 "${XDG_DATA_HOME:-$HOME/.local/share}/gg-homunculus/projects/<project-hash>/observations.jsonl"

# Disable observation temporarily if causing high CPU
touch "${XDG_DATA_HOME:-$HOME/.local/share}/gg-homunculus/disabled"
```

**Note:** Do not also add `skills/continuous-learning-v2/hooks/observe.sh` manually to `~/.claude/settings.json`; doing so alongside the plugin hooks will record observations twice.

---

## Context Window Overflow

**Symptom:** "Context too long" errors or incomplete agent responses.

```bash
# Reduce file size before analysis
head -n 100 large-file.log > sample.log

# Split large tasks
# Instead of: "Review all 40 files"
# Use:        "Review files in internal/service/"
```

For plan orchestration with many steps, work through the plan in smaller batches rather than feeding the full plan at once.

---

## Runtime Requirements

GG plugin scripts require **Node.js** for hook dispatch. The Go and Python toolchain is required for the respective quality gates.

```bash
# Check required runtimes
node --version     # required for hook scripts (v18+ recommended)
go version         # required for /gg:go-build, /gg:go-test, /gg:go-review
python3 --version  # required for /gg:python-review

# Go tools used by GG quality gates
which govulncheck || go install golang.org/x/vuln/cmd/govulncheck@latest

# Python tools used by GG quality gates
pip install mypy ruff pip-audit
```

---

## Common Error Messages

### `EACCES: permission denied`

```bash
# Fix hook script permissions
find ~/.claude/plugins -name "*.sh" -exec chmod +x {} \;
find ~/.claude/plugins -name "*.js" -exec chmod +x {} \;
```

### `MODULE_NOT_FOUND`

```bash
# The GG plugin scripts have no external npm dependencies.
# If this error appears, check that the plugin root is correctly resolved:
echo $GG_PLUGIN_ROOT
echo $CLAUDE_PLUGIN_ROOT
```

### `spawn UNKNOWN` (Windows)

```bash
# Convert CRLF to LF on hook scripts
find ~/.claude/plugins -name "*.sh" -exec dos2unix {} \;
```

### Hook silently skipped

```bash
# Check GG_HOOK_PROFILE and GG_DISABLED_HOOKS
echo $GG_HOOK_PROFILE
echo $GG_DISABLED_HOOKS

# Enable debug output
export CLAUDE_DEBUG=1
```

---

## Rules Not Taking Effect

**Symptom:** Go or Python coding guidelines are not being followed.

**Cause:** Rules are not distributed via the plugin — this is a Claude Code upstream limitation. They must be copied manually.

```bash
# Verify rules are installed
ls ~/.claude/rules/gg/

# If empty, copy from your gg-plugins checkout
mkdir -p ~/.claude/rules/gg
cp -R /path/to/gg-plugins/plugins/gg/rules/common ~/.claude/rules/gg/
cp -R /path/to/gg-plugins/plugins/gg/rules/golang ~/.claude/rules/gg/   # for Go
cp -R /path/to/gg-plugins/plugins/gg/rules/python ~/.claude/rules/gg/   # for Python

# Project-level alternative (current repo only)
mkdir -p .claude/rules/gg
cp -R /path/to/gg-plugins/plugins/gg/rules/common .claude/rules/gg/
```

Claude Code auto-loads all `.md` files under `~/.claude/rules/` and `.claude/rules/` — no extra configuration needed once files are in place.

---

## Related Documentation

- [README.md](./README.md) — Installation and overview
- [plugins/gg/README.md](./plugins/gg/README.md) — Plugin internals and workflow
- [plugins/gg/gg-commands-reference.md](./plugins/gg/gg-commands-reference.md) — Command reference
