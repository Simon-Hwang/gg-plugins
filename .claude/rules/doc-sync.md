# Doc Sync — Narrow Rule for `gg-plugins` Contributors

> **Scope:** This is a repository-level rule for contributors working ON
> `gg-plugins` itself. It is NOT shipped into target projects that consume
> the plugin.
> Location: `gg-plugins/.claude/rules/doc-sync.md`

This rule is intentionally narrow. It does **not** require keeping four
governance files in lockstep for every rename. It enforces only what is
load-bearing for the plugin to function correctly.

## The Two Hard Invariants

Only two things break the plugin if violated. Everything else is documentation
hygiene that can be done lazily.

### Invariant 1 — Thin-shortcut commands must point to a real agent

If `commands/<x>.md` is a thin shortcut whose body is essentially
"invoke the `<y>` agent", then `agents/<y>.md` must exist. If you rename
or remove the agent, grep `commands/` for references and update the pointer.

```bash
rg -l "the \`?[<old-agent-name>]\`? agent|invokes? the \*\*[<old-agent-name>]\*\*" commands/
```

Inline-workflow commands (whose prompt body IS the workflow) and
subsystem-CLI commands (which wrap a script) have no agent dependency and
are out of scope for this invariant.

### Invariant 2 — `manifests/` must list every installable asset

The selective installer (`install.sh`) reads `manifests/install-*.json` to
decide what to copy. Assets that exist on disk but are not listed in a module
will silently be omitted from selective installs.

When you **add a new skill directory**:

- Append its path to the appropriate module's `paths` array in
  `manifests/install-modules.json`. Create a new module only if it doesn't
  fit an existing group.

When you **remove a skill directory**:

- Remove the path from its module. If the module becomes empty, remove the
  module entry and update any component or profile that referenced it.

When you **add a new language pack** (`rules/<lang>/`):

- Add or extend a `rules-<lang>` module in `install-modules.json`.
- Optionally add a `lang:<x>` component in `install-components.json`.
- Optionally add the module to relevant profiles in `install-profiles.json`.

Agents and commands are bulk-copied via `agents-core` / `commands-core`
modules, so adding or renaming individual agent/command files does NOT
require a manifest update.

## Optional Hygiene (Lazy is Fine)

These are nice to keep current but do not break the plugin if they lag:

- `AGENTS.md` — `## Available Agents` tables and orchestration chains
- `CLAUDE.md` — `## Key Commands` and `## Skills` tables
- `RULES.md` — `## Agent Format` / `## Skill Format` / `## Command Format`
  sections (update only if a format constraint actually changes)
- `agent.yaml` — `agents:` / `skills:` / `commands:` lists (used by
  plugin-format installers; check before release)
- `README.md` profiles table (only when you change `install-profiles.json`)

You do not need to update all of these in every asset PR. Update them when
they would mislead a future reader, or as part of a separate doc cleanup
pass.

## Examples

### Adding a new agent `sql-optimizer`

```text
agents/sql-optimizer.md created
→ Invariant 1: no action (no thin-shortcut command references it)
→ Invariant 2: agents-core already covers all agents — no manifest change
→ Optional:    add to AGENTS.md "Data & Infrastructure" table when convenient
```

### Adding a new skill `redis-cluster`

```text
skills/redis-cluster/SKILL.md created
→ Invariant 1: not applicable
→ Invariant 2: append "plugins/gg/skills/redis-cluster" to skills-database.paths
               in manifests/install-modules.json
→ Optional:    add row to CLAUDE.md skills table when convenient
```

### Renaming agent `code-architect` → `feature-architect`

```text
agents/code-architect.md → agents/feature-architect.md
→ Invariant 1: grep commands/ for "code-architect" — none currently → no change
→ Invariant 2: agents-core copies the whole directory — no manifest change
→ Optional:    rename references in AGENTS.md tables when convenient
```

### Adding a new command `/gg:db-migrate` (thin shortcut to database-reviewer)

```text
commands/db-migrate.md created (body: "invoke the database-reviewer agent")
→ Invariant 1: agents/database-reviewer.md must exist — confirmed
→ Invariant 2: commands-core covers all commands — no manifest change
→ Optional:    add bullet to CLAUDE.md Key Commands when convenient
```

### Adding a new language pack `rust`

```text
rules/rust/ and skills/rust-patterns/ created
→ Invariant 2 (load-bearing):
   • install-modules.json:    create rules-rust and skills-rust modules
   • install-components.json: add lang:rust component
   • install-profiles.json:   add to full profile
   • README.md:               update profiles/component-families table
→ Optional:    AGENTS.md / CLAUDE.md narrative updates when convenient
```

## Enforcement

Only Invariant 1 and Invariant 2 violations block a PR. Missing optional
hygiene is a comment, not a merge blocker.
