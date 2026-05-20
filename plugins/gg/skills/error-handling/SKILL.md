---
name: error-handling
description: Use when designing or reviewing robust error handling for Go or Python services, including typed/domain errors, API responses, retries, circuit breakers, logging, and observability.
origin: gg
---

# Error Handling Patterns

Use consistent error handling so Go/Python services fail clearly, expose safe API responses, and preserve enough context for debugging.

## Core Principles

1. **Do not swallow errors**: handle, log with context, or return/raise.
2. **Separate user messages from developer details**.
3. **Make errors part of the API contract**.
4. **Wrap or chain errors with context at boundaries**.
5. **Retry only when the operation is safe and bounded**.

## Go Patterns

Use sentinel or typed errors when callers need to branch:

```go
var ErrOrderNotFound = errors.New("order not found")

func (s *Service) GetOrder(ctx context.Context, id string) (*Order, error) {
    order, err := s.repo.Get(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get order %s: %w", id, err)
    }
    if order == nil {
        return nil, ErrOrderNotFound
    }
    return order, nil
}
```

At HTTP boundaries, map domain errors to status codes in one place.

## Python Patterns

Use domain-specific exceptions and preserve exception chains:

```python
class OrderNotFoundError(Exception):
    pass


def get_order(order_id: str) -> Order:
    try:
        order = repo.get(order_id)
    except DatabaseError as exc:
        raise ServiceError(f"failed to load order {order_id}") from exc
    if order is None:
        raise OrderNotFoundError(order_id)
    return order
```

Framework handlers should convert known exceptions into safe responses and log unknown exceptions with request context.

## API Error Response Shape

Prefer a stable response contract:

```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found",
    "request_id": "req_123"
  }
}
```

Do not expose stack traces, SQL, credentials, tokens, or internal hostnames.

## Retries and Circuit Breakers

- Retry only idempotent operations or operations with idempotency keys.
- Use exponential backoff with jitter.
- Set a maximum retry budget.
- Respect context cancellation and deadlines.
- Open a circuit or fail fast when a dependency is clearly unhealthy.

## Review Checklist

- [ ] Every external call has timeout/cancellation.
- [ ] Every database or queue error is surfaced with context.
- [ ] API handlers map known errors to stable status codes.
- [ ] Logs include request ID or correlation ID.
- [ ] Sensitive details are not returned to clients.
- [ ] Tests cover happy path, validation failure, dependency failure, and authorization failure.
