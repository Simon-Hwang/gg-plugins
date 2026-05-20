---
description: Feature kickoff — research existing solutions, explore the codebase, plan implementation, and produce an architecture blueprint before writing any code.
argument-hint: "<feature description | requirement>"
---

# Feature — Kickoff a New Feature

Orchestrates the full pre-implementation phase: research → explore → plan → design. Delegates sequentially to specialized agents. **No code is written until you confirm the plan.**

**Input**: $ARGUMENTS

---

## Phase 1 — Research: Search Before Building

Apply the `search-first` skill to avoid reinventing wheels.

Search for existing solutions:

```bash
# Check for existing implementations in the codebase
rg -n "<keyword from $ARGUMENTS>" --type go --type py

# Check if a library already solves this
# (use docs-lookup agent for API docs)
```

Search targets:
1. **Codebase**: Does a similar feature or utility already exist?
2. **Libraries**: Is there a well-maintained package that solves this? (invoke `docs-lookup` agent with Context7)
3. **Patterns**: Which architectural patterns does this codebase use for similar features?

Report findings before proceeding. If an existing solution covers 80%+ of the need, recommend reusing it.

---

## Phase 2 — Explore: Understand the Codebase

Invoke `code-explorer` agent to:
- Trace execution paths related to `$ARGUMENTS` (similar handlers, services, repositories)
- Map which layers (handler → service → repository) the new feature will touch
- Identify integration points, shared utilities, and domain boundaries
- Surface existing test patterns and fixture conventions

Apply `codebase-onboarding` skill if this is an unfamiliar area of the codebase.

Apply `iterative-retrieval` to gather progressive context — start with entry points, then follow dependencies.

---

## Phase 3 — Plan: Break Down Implementation

Invoke `planner` agent to produce a step-by-step implementation plan grounded in the codebase patterns found in Phase 2.

The plan must include:
- Requirements restatement
- Files to create/modify with rationale
- Dependency order (what to build first)
- Risk assessment with mitigations
- Acceptance criteria

**WAIT**: Do not proceed to Phase 4 without user confirmation of the plan.

---

## Phase 4 — Design: Architecture Blueprint

Invoke `code-architect` agent to produce an implementation blueprint based on:
- The plan confirmed in Phase 3
- Codebase patterns discovered in Phase 2
- The feature requirements from `$ARGUMENTS`

The blueprint includes:
- Concrete files, interfaces, and struct/type definitions
- Data flow diagram (inputs → transforms → outputs)
- Integration points with existing layers
- Build order for safe, incremental implementation

If the design involves architectural trade-offs with multiple credible paths (e.g., sync vs async, REST vs event-driven), activate the `council` skill (Architect + Skeptic + Pragmatist + Critic) to evaluate options before committing.

Record the chosen architecture as an ADR using `architecture-decision-records` skill.

---

## Phase 5 — Handoff

Produce a final handoff summary:

```
Feature Kickoff Complete
─────────────────────────────────────────
Feature:    <name from $ARGUMENTS>
─────────────────────────────────────────
Research:   <existing solutions found / none>
Codebase:   <key files and patterns to mirror>
Plan:       <N phases, confirmed by user>
Blueprint:  <key interfaces and data flow>
ADR:        <decision recorded / none>
─────────────────────────────────────────
Next steps:
  /gg:tdd    → implement with test-first methodology
  /gg:db     → if feature requires DB changes first
  /gg:design → deep-dive architecture if trade-offs remain
```

---

## Skills activated

- `search-first` — research before building
- `codebase-onboarding` — understand unfamiliar code areas
- `iterative-retrieval` — progressive context gathering for agent chain
- `architecture-decision-records` — record key decisions
- `council` — adversarial evaluation when multiple paths exist (optional)
- `backend-patterns` — reference for Go/Python service structure

## Agents invoked (in sequence)

1. `docs-lookup` — library API research (Phase 1)
2. `code-explorer` — codebase exploration (Phase 2)
3. `planner` — implementation plan (Phase 3)
4. `code-architect` — architecture blueprint (Phase 4)

## Related commands

- `/gg:design` — deep architecture/API design session (standalone)
- `/gg:tdd` — implement with TDD after this kickoff
- `/gg:db` — database design if feature is data-heavy
- `/gg:plan` — lightweight planning without full research/design pipeline
