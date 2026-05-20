---
name: backend-patterns
description: Use when designing Go or Python backend services, including handlers, services, repositories, dependency boundaries, validation, transactions, background jobs, and observability.
origin: gg
---

# Backend Patterns

Backend guidance for GG's Go/Python scope. Use this for service structure and boundary decisions; use `api-design`, `database-migrations`, `golang-patterns`, or `python-patterns` for narrower details.

## Layering

Keep boundaries explicit:

```text
transport/http  -> parses requests, returns responses
application     -> use cases and orchestration
domain          -> business rules and entities
storage         -> database adapters
integrations    -> external services
```

Handlers should be thin. Domain and application logic should be testable without starting an HTTP server.

## Request Flow

1. Parse and validate input.
2. Authorize before reading or mutating protected data.
3. Call a service/use-case method.
4. Commit transaction or publish event at one clear boundary.
5. Return a stable API response.
6. Log request ID, duration, and error class.

## Repository Pattern

Use repositories to isolate persistence details when business logic would otherwise depend on SQL/ORM APIs.

```text
Service -> OrderRepository interface -> PostgresOrderRepository
```

Do not create repositories for trivial one-off queries unless they clarify ownership or improve tests.

## Transactions

- Keep transaction scope small.
- Do not perform slow network calls inside a database transaction.
- Make retries explicit and safe.
- For migrations or batch updates, include rollback and production-size analysis.

## Background Jobs

- Jobs must be idempotent or have deduplication.
- Persist job state when failure matters.
- Add retry limits and dead-letter handling.
- Expose metrics for queued, running, failed, and retried jobs.

## Observability

Capture enough context to debug production issues:

- request ID / trace ID
- user or tenant ID when safe
- route or operation name
- latency
- status/error code
- dependency timing for database and external calls

## Testing

- Unit test domain logic.
- Integration test repositories and transactions.
- API test critical handlers.
- E2E test critical workflows only.

## Common Mistakes

- Putting business rules in handlers.
- Sharing ORM models as public API contracts.
- Hiding errors behind generic 500 responses without logs.
- Adding caches without invalidation and memory bounds.
- Treating background jobs as fire-and-forget with no observability.
