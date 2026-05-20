---
description: Run a sequential chain of GG agents on a task. Use `custom "<agent1>,<agent2>,..." "<task>"` to compose ad-hoc chains. Each agent's output feeds the next as a HANDOFF.
argument-hint: "custom \"<agent1>[,<agent2>,...]\" \"<task description>\""
---

# Orchestrate Command

Run a sequential chain of GG agents where each agent's HANDOFF feeds the next. This command is the execution surface for prompts emitted by the `plan-orchestrate` skill.

## Supported Mode

### `custom` — ad-hoc sequential chain

```
/gg:orchestrate custom "<agent1>[,<agent2>,...]" "<task description>"
```

- Agent names come from the GG catalogue (see `plan-orchestrate` skill for the full list).
- Agents execute sequentially; each receives the previous agent's HANDOFF as context.
- The task description should be self-contained — the first agent does not need any other file open.

**Example:**
```
/gg:orchestrate custom "gg:tdd-guide,gg:python-reviewer,gg:security-reviewer" "Implement JWT refresh token rotation; Acceptance: refresh rotates token; old token rejected after use; no plaintext secret in logs"
```

## Agent HANDOFF Protocol

Each agent in the chain must close its turn with a structured HANDOFF block:

```markdown
## HANDOFF
### Work completed
- <bullet list of what was done>

### Artifacts produced
- <file or artifact path>: <one-line description>

### Next agent context
<what the next agent needs to know to continue>

### Remaining work
- <any items not completed, or "none">
```

The next agent reads this block as its starting context. Do not skip the HANDOFF even if the agent is last in the chain — it serves as the final summary.

## Available Agent Catalogue

General:
- `planner` — requirement restatement, risk decomposition, step planning
- `architect` — architecture, system design, refactor proposals
- `tdd-guide` — write tests → implement → 80%+ coverage
- `code-reviewer` — generic code review
- `security-reviewer` — security audit, OWASP, secret leakage
- `refactor-cleaner` — dead code, duplicate helper, and import cleanup
- `doc-updater` — documentation, codemap, README
- `docs-lookup` — third-party library API lookups (Context7)
- `e2e-runner` — end-to-end test orchestration
- `database-reviewer` — PostgreSQL schema, migration, performance
- `harness-optimizer` — local agent harness configuration
- `loop-operator` — long-running autonomous loops

Build error resolvers:
- `build-error-resolver` (generic) / `go-build-resolver` / `pytorch-build-resolver`

Language reviewers:
- `python-reviewer` / `go-reviewer`

## Tips

1. Start with `planner` for complex features to restate requirements before implementation.
2. Always end implementation chains with a reviewer (`code-reviewer`, `security-reviewer`, or `python-reviewer`/`go-reviewer`).
3. Use `security-reviewer` whenever the task touches auth, secrets, PII, or payment.
4. Keep task descriptions concise (200–600 characters) and include 1–3 Acceptance criteria.
5. Use the `plan-orchestrate` skill to auto-generate orchestrate prompts from a plan document.
