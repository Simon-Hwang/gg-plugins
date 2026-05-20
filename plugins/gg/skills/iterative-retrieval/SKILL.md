---
name: iterative-retrieval
description: Progressive context retrieval pattern for GG agent chains. Use when dispatching subagents that need codebase context, when a handoff lacks enough evidence, or when multi-agent work risks losing the main objective.
origin: gg
---

# Iterative Retrieval

Use this skill to solve the subagent context problem in GG workflows: the main Claude session knows the objective, but a delegated agent often receives only a narrow task string. The fix is to retrieve context in small evaluated loops, then pass the objective, evidence, gaps, and constraints forward as structured handoff material.

Core principle: **pass objective context and evidence, not just the query.**

## When to Use

Use this skill when:

- Spawning `code-explorer`, `planner`, `tdd-guide`, reviewer, or resolver agents that need repository context.
- A plan step touches unfamiliar code and the relevant files are not obvious.
- A subagent returns a summary that lacks evidence, file paths, or confidence.
- A multi-agent chain risks losing the user's actual objective between handoffs.
- Context is too large to send wholesale, but sending no context would make the agent guess.
- A failure suggests the agent searched the wrong area or used the wrong project terminology.

Do not use this skill for:

- Tiny single-file tasks where the relevant file is already known.
- Full repository asset audits; use `repo-scan`.
- Building persistent RAG documentation; use `repo-rag-builder`.
- Replacing `context-budget`; use that when the issue is token overhead or too many loaded surfaces.

## The Problem

Subagents are intentionally scoped. That saves context, but creates a gap:

- The orchestrator knows the purpose behind the task.
- The subagent sees a literal prompt and a small context slice.
- The first guessed search terms may not match project terminology.
- Returning a broad summary can hide missing evidence.

Bad approaches:

- **Send everything** - burns context and hides signal.
- **Send nothing** - forces guessing.
- **Guess once** - often misses local naming and architecture.

## Four-Phase Loop

Run at most three cycles. Stop earlier when enough high-confidence context has been found.

```text
DISPATCH -> EVALUATE -> REFINE -> LOOP
```

### Phase 1: Dispatch

Start with a broad but bounded search query based on the user objective.

Capture:

- Objective: what the user is trying to accomplish.
- Initial search terms: domain words, file globs, symbols, errors.
- Exclusions: generated files, vendored code, caches, build output.
- Expected evidence: files, tests, config, logs, command output.

Example prompt fragment for a subagent:

```markdown
Objective: Find the code path for token expiry handling so a later agent can write a focused fix.
Initial search: token, expiry, refresh, session.
Exclude: generated files, vendored dependencies, tests unless they describe expected behavior.
Return: high-relevance files, why each matters, missing context, and confidence.
```

### Phase 2: Evaluate

Score each result before accepting it.

| Score | Meaning | Action |
|---|---|---|
| `0.8-1.0` | Directly implements or verifies the target behavior | Keep |
| `0.5-0.7` | Related pattern, type, config, or adjacent flow | Keep only if it fills a gap |
| `0.2-0.4` | Tangential | Usually exclude |
| `0.0-0.2` | Irrelevant | Exclude and refine away |

For each candidate, record:

- file or artifact path
- relevance score
- reason it matters
- evidence found
- missing context it reveals

### Phase 3: Refine

Use what was learned to narrow the next search.

Refine by:

- Adding project terminology discovered in high-relevance files.
- Following imports, callers, routes, handlers, tests, migrations, or config references.
- Excluding confirmed irrelevant paths.
- Targeting missing context explicitly.

Example:

```text
Cycle 1 searched "rate limit" and found nothing.
Evaluation revealed the project uses "throttle".
Cycle 2 searches "throttle", "middleware", and route registration.
```

### Phase 4: Loop

Repeat up to three cycles.

Stop when:

- At least two or three high-relevance files are identified.
- No critical context gaps remain for the next agent.
- The next step has a clear input and acceptance criteria.

If gaps remain after three cycles, stop and report the missing context instead of pretending the handoff is complete.

## Handoff Format

Use this compact handoff when passing context to another GG agent:

```markdown
## Context Handoff

### Objective
- <what the next agent must achieve>

### High-Relevance Evidence
- `<path>` - relevance <0.0-1.0>; why it matters

### Project Terminology
- <local names, concepts, packages, services, tables, commands>

### Missing Context
- <what was not found or still needs confirmation>

### Constraints
- <scope guard, tests to preserve, security/DB/doc concerns>

### Recommended Next GG Capability
- <agent/skill/command> - <why>
```

## Integration with GG

### With `using-gg`

Use this skill during Phase 0 or Phase 2 when the route is unclear or a multi-step chain needs bounded context. Do not proceed to implementation if the next agent would have to guess which files matter.

### With `plan-orchestrate`

Each emitted task description should be self-contained. If a step depends on unknown code paths, include an instruction to perform iterative retrieval first or prepend `code-explorer` to the chain.

### With reviewer agents

Reviewer prompts should include:

- the objective
- changed files
- high-relevance source files
- test or verification evidence
- known missing context

Without those, a reviewer can only perform shallow style review.

### With failure recovery

If a subagent's answer lacks evidence, conflicts with observed tool output, or repeatedly searches the wrong area, use `agent-introspection-debugging` after this retrieval loop. If the issue is context bloat rather than missing evidence, use `context-budget`.

## Practical Example

Task: "Fix token expiry bug in a Python service."

```text
Cycle 1
- Search: token, expiry, auth, session
- Keep: auth/session.py (0.9), auth/tokens.py (0.8)
- Gap: refresh flow not found

Cycle 2
- Search: refresh, jwt, session renewal, imports from auth/tokens.py
- Keep: auth/refresh.py (0.9), tests/test_auth_refresh.py (0.8)
- Gap: route entrypoint

Cycle 3
- Search: auth router, login route, refresh endpoint
- Keep: api/routes/auth.py (0.85)
- Stop: enough context for TDD fix
```

Handoff:

```markdown
## Context Handoff

### Objective
- Reproduce and fix expired token refresh behavior.

### High-Relevance Evidence
- `auth/session.py` - 0.9; session expiry decision.
- `auth/tokens.py` - 0.8; JWT expiry decoding.
- `auth/refresh.py` - 0.9; refresh token flow.
- `tests/test_auth_refresh.py` - 0.8; existing expectations.
- `api/routes/auth.py` - 0.85; endpoint entrypoint.

### Missing Context
- Production token TTL source still needs confirmation.

### Recommended Next GG Capability
- `tdd-guide` - write a failing refresh-expiry test before changing code.
```

## Best Practices

- Start broad, then narrow; do not overfit the first query.
- Track missing context explicitly.
- Prefer high-relevance evidence over large context dumps.
- Use project terminology discovered from code, not guessed domain words.
- Stop after three cycles and report gaps.
- Keep handoffs concise; include only what the next agent needs.

