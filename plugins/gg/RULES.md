# Rules

## Must Always

- Delegate to specialized agents for domain tasks.
- Research existing code (GitHub, docs, registries) before writing new implementations.
- Write tests before implementation and verify 80%+ coverage.
- Validate inputs and keep security checks intact.
- Follow established repository patterns before inventing new ones.
- Keep contributions focused, reviewable, and well-described.
- When renaming or removing an agent, grep `commands/` and update any thin-shortcut command that references it. When adding/renaming/removing a command or skill, update `agent.yaml` so manifest-driven installs resolve. See `AGENTS.md` for the full (narrow) doc-sync rule.

## Must Never

- Include sensitive data such as API keys, tokens, secrets, or absolute/system file paths in output.
- Submit untested changes.
- Bypass security checks or validation hooks.
- Duplicate existing functionality without a clear reason.
- Ship code without checking the relevant test suite.
- Silently swallow errors or use bad fallbacks (use `silent-failure-hunter`).

## Agent Format

- Agents live in `agents/*.md`.
- Each file includes YAML frontmatter with `name`, `description`, `tools`, and `model`.
- File names are lowercase with hyphens and must match the agent name.
- Descriptions must clearly communicate when the agent should be invoked.
- Agents do not require a paired `/gg:` command. Pairing is optional UX, not a contract.

## Skill Format

- Skills live in `skills/<name>/SKILL.md`.
- Each skill includes YAML frontmatter with `name`, `description`.
- Skill bodies must include practical guidance and clear "When to Use" sections.
- After adding, renaming, or removing a skill, update `agent.yaml`'s skills list so manifest-driven installs resolve.

## Command Format

- Commands live in `commands/*.md`.
- Each command file includes a description in frontmatter.
- Commands are prefixed `/gg:` when invoked (e.g., `/gg:plan`).
- A command takes one of three shapes: thin shortcut (pointer to one agent), inline workflow (the prompt body IS the workflow), or subsystem CLI (wraps a script).
- After adding, renaming, or removing a command, update `agent.yaml`'s commands list. For thin-shortcut commands, verify the referenced agent exists.

## Hook Format

- Top-level hooks use `hooks/hooks.json` with matcher-driven registration.
- Skill-level hooks live in `skills/<name>/hooks/hooks.json`.
- Matchers should be specific instead of broad catch-alls.
- Exit `1` only when blocking behavior is intentional; otherwise exit `0`.
- Error and info messages should be actionable.

## Rule Format

- Rules live in `rules/<language>/<topic>.md`.
- Common rules apply to all languages under `rules/common/`.
- Language-specific rules go under `rules/golang/`, `rules/python/`, etc.
- Rules are always-follow guidelines, not suggestions.

## Commit Style

- Use conventional commits: `feat(agents):`, `fix(skills):`, `docs(rules):`, `chore:`.
- Keep changes modular and explain user-facing impact in the PR summary.
- Reference the specific asset changed (e.g., `feat(agents): add silent-failure-hunter`).
