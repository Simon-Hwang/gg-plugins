---
name: hexagonal-architecture
description: Use when designing or refactoring Go/Python services with ports and adapters, dependency inversion, testable use cases, and clean separation from frameworks or databases.
origin: gg
---

# Hexagonal Architecture

Hexagonal architecture separates business behavior from delivery mechanisms such as HTTP, databases, queues, and external APIs. Use it when a Go/Python service needs clearer boundaries or better testability.

## Core Model

```text
Inbound adapters  ->  application/use cases  ->  outbound ports
HTTP/CLI/Jobs         domain behavior            repository/gateway interfaces
```

Adapters depend on the application core. The application core defines the ports it needs. Concrete adapters implement those ports.

## Recommended Layout

Python:

```text
app/
  domain/
  application/
    ports/
    use_cases/
  adapters/
    http/
    persistence/
    external/
```

Go:

```text
internal/
  domain/
  app/
    ports/
    usecase/
  adapter/
    http/
    postgres/
    external/
```

Follow existing project layout when it is already consistent.

## When to Use

- Business rules are tangled with handlers or ORM calls.
- Tests require booting the whole application for simple behavior.
- You need to swap a database, queue, or external service adapter.
- Multiple transports share the same use case.

Skip this for tiny scripts, one-off endpoints, or code that is already simple and local.

## Port Design

Keep ports small and owned by the use case:

```go
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
}
```

```python
class OrderRepository(Protocol):
    def save(self, order: Order) -> None: ...
```

Avoid generic "god repositories" that mirror an entire database.

## Testing Strategy

- Unit test domain rules without adapters.
- Use fake ports for use-case tests.
- Integration test real adapters separately.
- API test only critical transport behavior.

## Common Mistakes

- Putting framework decorators or ORM models in domain objects.
- Defining ports around database tables instead of use-case needs.
- Creating too many layers for a small feature.
- Letting adapters call each other instead of going through application services.
