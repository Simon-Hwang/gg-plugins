---
description: Architecture and API design — evaluate trade-offs with a four-voice council, apply hexagonal/backend patterns, design REST APIs, and record decisions as ADRs.
argument-hint: "<design question | system to design | API to specify>"
---

# Design — Architecture & API Design Session

For deliberate architecture decisions and API contracts. When multiple valid paths exist, opens a four-voice council before committing. Records all decisions as ADRs.

**Input**: $ARGUMENTS

---

## Step 1 — Scope the Design Problem

Clarify what needs to be designed from `$ARGUMENTS`:

| Type | Examples | Primary Skills |
|------|----------|---------------|
| Service architecture | "design the order processing service" | `hexagonal-architecture`, `backend-patterns` |
| REST API contract | "design the user management API" | `api-design` |
| Database schema | "design the subscription data model" | → use `/gg:db` instead |
| System boundaries | "where should auth live?" | `hexagonal-architecture`, `council` |
| Trade-off decision | "sync vs async processing" | `council` |

Read relevant existing code before proposing anything new:
```bash
rg -n "<keyword>" --type go --type py -l  # find related files
```

---

## Step 2 — Council (if trade-offs exist)

If the design problem has **two or more credible implementation paths** with real trade-offs, activate the `council` skill.

Four independent voices evaluate the options:
- **Architect** — long-term maintainability and extensibility
- **Skeptic** — risks, failure modes, and edge cases
- **Pragmatist** — delivery speed, team familiarity, operational cost
- **Critic** — what assumptions are hidden, what could be wrong

Council produces: a verdict, the winning path, dissenting concerns, and the rationale.

**Do not run council for obvious/uncontested design decisions.** Use it when you'd otherwise spend significant time debating options.

---

## Step 3 — Architecture Design

Invoke `architect` agent to produce the service/system design based on the path chosen (or the only viable path if Step 2 was skipped):

Apply `hexagonal-architecture` skill for Go/Python backend services:
- **Ports** (inbound/outbound interfaces)
- **Adapters** (HTTP handler, gRPC, DB repository, queue consumer)
- **Core domain / use cases** (business logic, isolated from frameworks)
- **Dependency rule**: core must not import adapters

Apply `backend-patterns` skill for:
- Handler → Service → Repository layer boundaries
- Transaction management patterns
- Background job design
- Observability hooks (metrics, traces, logs)

---

## Step 4 — API Contract (if applicable)

Apply `api-design` skill to specify the REST API:

| Concern | Guidance |
|---------|----------|
| Resource naming | Noun-based, plural, hierarchical (`/users/{id}/orders`) |
| HTTP methods | GET (read), POST (create), PUT/PATCH (update), DELETE |
| Status codes | 200/201/204/400/401/403/404/409/422/500 with consistent meaning |
| Error format | `{"error": {"code": "...", "message": "...", "details": [...]}}` |
| Pagination | Cursor-based preferred; offset for simple cases |
| Filtering | Query params with documented operators |
| Versioning | Path (`/v1/`) or header; document breaking-change policy |
| Rate limiting | Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |

Produce an OpenAPI sketch or interface table for the proposed endpoints.

---

## Step 5 — Invoke `code-architect` for Implementation Blueprint

After the architecture and API are settled, invoke `code-architect` agent to produce:
- Concrete file tree with new files and modifications
- Interface/struct definitions (Go) or class/Protocol definitions (Python)
- Data flow: request → handler → use case → repository → response
- Build order: which files to create first

---

## Step 6 — Record Decision as ADR

Apply `architecture-decision-records` skill to capture:
- **Context**: what problem triggered this design session
- **Decision**: what was chosen
- **Alternatives considered**: what was evaluated and why rejected
- **Consequences**: trade-offs, future constraints, migration path

Save to `.claude/decisions/ADR-NNN-<slug>.md` or the project's ADR directory.

---

## Output

```
Design Session Complete
─────────────────────────────────────────
Subject:    <$ARGUMENTS>
Council:    <ran / skipped — reason>
Verdict:    <chosen path>
─────────────────────────────────────────
Architecture:
  Layers:   <handler → service → repository>
  Ports:    <inbound / outbound interfaces>
  Adapters: <HTTP, DB, Queue, ...>

API Contract:
  Endpoints: N defined
  Breaking:  YES / NO

Blueprint:
  Files to create: N
  Files to modify: N

ADR:        .claude/decisions/ADR-NNN-<slug>.md
─────────────────────────────────────────
Next: /gg:feature or /gg:tdd to implement
```

---

## Skills activated

- `council` — four-voice adversarial evaluation (when trade-offs exist)
- `hexagonal-architecture` — ports and adapters structure
- `api-design` — REST API contract patterns
- `backend-patterns` — Go/Python service layer conventions
- `architecture-decision-records` — capture decisions as ADRs

## Agents invoked

- `architect` — service/system design
- `code-architect` — implementation blueprint

## Related commands

- `/gg:feature` — full kickoff with research + explore phases before design
- `/gg:db` — database schema design (pairs with this command for data-heavy features)
- `/gg:tdd` — implement the design with test-first methodology
- `/gg:plan` — lightweight planning without architecture depth
