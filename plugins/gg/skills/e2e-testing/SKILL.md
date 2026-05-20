---
name: e2e-testing
description: Go/Python backend end-to-end testing patterns for API workflows, databases, queues, auth, webhooks, service boundaries, fixtures, and stable verification.
origin: gg
---

# Backend E2E Testing Patterns

Use this skill to design and maintain end-to-end tests for Go and Python backend systems. Focus on real service behavior across API, persistence, authorization, background jobs, and external boundaries.

## Test Organization

```text
tests/
  integration/
  e2e/
  fixtures/
```

For Go:

```text
internal/
  app/
  transport/http/
  storage/
```

Keep tests close to the boundary they exercise, but isolate expensive full-stack scenarios in `e2e` or clearly marked integration suites.

## What to Test

- authentication and authorization workflows
- critical CRUD flows with database side effects
- migrations and rollback-sensitive paths
- webhook ingestion and idempotency
- queue/job processing with observable completion
- error responses and validation failures
- permission boundaries and tenant isolation

## Python Patterns

Use the project's framework-native test client:

- Python services: `pytest` with project-native clients or `httpx`
- Generic services: `pytest`, fixtures, and temporary test resources

Example shape:

```python
def test_create_order_persists_and_returns_order_id(client, db_session):
    response = client.post("/orders", json={"sku": "abc", "quantity": 2})

    assert response.status_code == 201
    order_id = response.json()["id"]
    assert db_session.get(Order, order_id) is not None
```

## Go Patterns

Prefer real handlers with controlled dependencies:

```go
func TestCreateOrderPersistsAndReturnsID(t *testing.T) {
    app := newTestServer(t)

    resp := app.PostJSON(t, "/orders", map[string]any{
        "sku": "abc",
        "quantity": 2,
    })

    require.Equal(t, http.StatusCreated, resp.StatusCode)
    require.NotEmpty(t, resp.JSON["id"])
}
```

## Stability Rules

- Do not use sleeps for readiness. Poll observable state with a timeout.
- Reset database state per test or use isolated test schemas.
- Stub external services unless the scenario specifically tests that integration.
- Capture request IDs, logs, and response bodies on failure.
- Quarantine flaky tests only with a tracked reason.

## Verification

```bash
# Python
pytest tests/e2e -q
pytest tests/integration -q

# Go
go test ./... -run 'Test.*E2E|Test.*Integration'
```

Prefer project-local commands when available and report exactly what passed.
