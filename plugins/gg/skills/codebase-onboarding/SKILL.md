---
name: codebase-onboarding
description: Use when onboarding to an unfamiliar Go or Python repository and producing a concise architecture map, entry points, conventions, test commands, and safe first-change guidance.
origin: gg
---

# Codebase Onboarding

Use this skill to quickly understand a Go/Python codebase before changing it. The output should help a future engineer or agent make safe, local edits.

## Discovery Checklist

1. **Stack markers**
   - Go: `go.mod`, `go.work`, `cmd/`, `internal/`
   - Python: `pyproject.toml`, `requirements.txt`, `uv.lock`, `manage.py`
2. **Entrypoints**
   - HTTP server startup
   - CLI commands
   - background workers
   - scheduled jobs
3. **Core modules**
   - handlers/routes/views
   - services/use cases
   - repositories/storage
   - models/schemas
4. **Verification**
   - test commands
   - lint/type commands
   - build commands
   - required services
5. **Operational surface**
   - migrations
   - configuration
   - Docker/compose
   - CI workflow

## Output Format

```markdown
# Codebase Onboarding

## Stack
- Language/framework:
- Package manager:
- Test framework:

## Entry Points
- `<path>`: what starts here

## Architecture Map
- Transport:
- Application/service:
- Domain/model:
- Persistence:
- Integrations:

## Verification
- Test:
- Lint/type:
- Build:

## Conventions
- Naming/layout:
- Error handling:
- Testing:

## Safe First Changes
- Low-risk area:
- Risky area:
- Ask before touching:
```

## Guidance

- Prefer reading project files over guessing from framework defaults.
- Keep the map short; link to files instead of copying large code.
- Call out unknowns explicitly.
- Do not create persistent docs unless the user asks.
