# GG Plugins — Codex Contributor Instructions

These instructions apply when Codex is working on the `gg-plugins` repository itself.
They complement the Claude Code contributor rule at `.claude/rules/doc-sync.md`.

## Repository Scope

`gg-plugins` now supports two harnesses from the same source tree:

- Claude Code: `.claude-plugin/marketplace.json`, `plugins/gg/plugin.json`,
  `commands/`, `agents/`, `hooks/`, `rules/`, and `skills/`.
- Codex: `.agents/plugins/marketplace.json`,
  `plugins/gg/.codex-plugin/plugin.json`, `plugins/gg/.mcp.json`, and
  `plugins/gg/skills/`.

Keep the shared source files authoritative. Prefer adapter skills over copying
command, agent, or rule content into a separate Codex-only copy.

## Required Doc Sync Checks

Before finishing any change to GG assets, apply the two hard invariants from
`.claude/rules/doc-sync.md`.

### 1. Thin-Shortcut Commands Must Point To Real Agents

If `plugins/gg/commands/<x>.md` is a thin shortcut whose body essentially says
to invoke a specific agent, then `plugins/gg/agents/<agent>.md` must exist.

When renaming or removing an agent, search command references and update any
thin shortcut pointers:

```bash
rg -n "<old-agent-name>" plugins/gg/commands
```

Inline workflow commands and script-wrapper commands do not need a paired agent.

### 2. Install Manifests Must List Every Installable Asset

When adding, renaming, or removing an installable skill or rule pack, update the
selective installer manifests so `install.sh` does not silently omit assets.

For a new skill directory:

- Add its path to the relevant `paths` array in
  `manifests/install-modules.json`, or create a new module if needed.
- If the module represents a new selectable capability, add it to
  `manifests/install-components.json`.
- If the capability belongs in `full`, add the module to
  `manifests/install-profiles.json`.
- Update `README.md` profile/component text when counts or selectable
  capability names change.

Agents and commands are bulk-copied by `agents-core` and `commands-core`, so
adding an individual agent or command does not require an install manifest
change unless the bulk-copy module itself changes.

## Codex Adapter Rules

Codex cannot register Claude Code slash commands or named agents directly.
Maintain these adapter skills as the bridge:

- `plugins/gg/skills/codex-command-router`
- `plugins/gg/skills/codex-agent-router`
- `plugins/gg/skills/codex-rule-router`
- `plugins/gg/skills/codex-mcp-runtime`

When adding a new command, agent, or rule pack, update the relevant adapter
catalog if the new asset should be discoverable from Codex by name.

When changing `plugins/gg/.codex-plugin/plugin.json`, run Codex plugin
validation before handing back the change.

## Verification

Use focused checks for the files changed. For Codex compatibility changes, run:

```bash
PYTHONPATH=/tmp/codex-plugin-validator-pyyaml \
  python3 /Users/didi/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  /Users/didi/Desktop/coding/gg-plugins/plugins/gg
```

For install manifest changes, run:

```bash
node --test tests/install-profiles.test.js tests/plugin-manifest.test.js tests/no-python-web-surface.test.js
```

For hook or runtime-script changes, run the relevant `node --test tests/*.test.js`
subset before broadening to the full test suite.
