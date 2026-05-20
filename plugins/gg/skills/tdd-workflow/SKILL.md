---
name: tdd-workflow
description: Use when implementing or fixing Go/Python behavior and tests should drive the change. Enforces RED-GREEN-REFACTOR with focused unit, integration, API, and service-level coverage.
origin: gg
---

# TDD Workflow

Use this workflow for Go/Python backend changes. Write a failing test first, make it pass with the smallest implementation, then refactor while tests stay green.

## When to Activate

- Writing new Go or Python behavior.
- Fixing a bug with a regression test.
- Refactoring behavior that must remain stable.
- Adding API endpoints, database logic, jobs, or service integrations.

## Core Loop

### 1. RED: Write the Failing Test

Test the desired behavior or bug reproduction before changing production code.

Python:

```bash
pytest path/to/test_file.py -q
```

Go:

```bash
go test ./path/to/package -run TestName
```

The failure must be caused by the intended missing behavior or bug, not syntax errors, missing dependencies, or broken setup.

### 2. GREEN: Make the Smallest Fix

- Change only the code needed to pass the test.
- Avoid broad refactors.
- Keep new abstractions out unless the test exposes real duplication or boundary pressure.

### 3. REFACTOR: Improve Safely

- Rename, simplify, or deduplicate after tests pass.
- Re-run the focused test and then the relevant broader suite.

## Test Types

| Type | Use for |
|---|---|
| Unit | Pure functions, domain rules, small services |
| Integration | database adapters, repositories, framework wiring |
| API | HTTP handlers, auth, validation, response contracts |
| E2E/service | critical workflows across multiple boundaries |

## Go Example

```go
func TestValidateEmailRejectsInvalidAddress(t *testing.T) {
    err := ValidateEmail("not-an-email")
    require.ErrorIs(t, err, ErrInvalidEmail)
}
```

## Python Example

```python
def test_validate_email_rejects_invalid_address():
    with pytest.raises(InvalidEmailError):
        validate_email("not-an-email")
```

## Coverage and Verification

```bash
# Python
pytest --cov=app --cov-report=term-missing
ruff check .
mypy .  # if configured

# Go
go test ./... -cover
go vet ./...
```

Respect the project's existing thresholds. If no threshold exists, target 80%+ for changed modules and 100% for critical business rules.

## Anti-Patterns

- Writing tests after implementation and calling it TDD.
- Testing framework internals instead of business behavior.
- Adding defensive branches that no test or invariant needs.
- Using sleeps for async behavior instead of observable conditions.
- Mocking the code under test rather than its external dependencies.

## Completion Evidence

Report:

- RED command and intended failure.
- GREEN command and passing result.
- Refactor verification command if refactoring occurred.
- Any skipped broader checks and why.
