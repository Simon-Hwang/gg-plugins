---
name: coding-standards
description: Use when establishing or reviewing Go/Python coding conventions for naming, structure, readability, maintainability, imports, typing, errors, and tests.
origin: gg
---

# Coding Standards

Baseline coding conventions for GG's Go/Python backend scope. Use narrower skills such as `golang-patterns`, `python-patterns`, `api-design`, or `database-migrations` for domain-specific details.

## When to Use

- Starting a new Go or Python module.
- Reviewing code for maintainability.
- Refactoring code toward local conventions.
- Creating project guidance for contributors or agents.

## Shared Principles

- Prefer clear names over clever abstractions.
- Keep functions focused and easy to test.
- Separate domain logic from transport, persistence, and framework code.
- Make error paths explicit.
- Keep dependencies pointed inward: business logic should not depend on web frameworks.
- Add abstractions only when they remove real duplication or isolate volatile dependencies.
- Preserve existing project style unless it conflicts with correctness or safety.

## Go Standards

- Use `gofmt` and `go vet` as non-negotiable baselines.
- Keep package names short, lowercase, and meaningful.
- Return errors with context using `%w` when wrapping.
- Pass `context.Context` through I/O boundaries.
- Prefer small interfaces owned by the consumer.
- Avoid package-level mutable state unless lifecycle and concurrency are explicit.
- Use table-driven tests for variants.

## Python Standards

- Use project tooling such as `ruff`, `black`, `mypy`, and `pytest` when present.
- Add type hints for public functions and complex data structures.
- Prefer dataclasses or Pydantic models for structured data.
- Avoid broad `except Exception` unless re-raising or logging with context.
- Keep framework adapters thin; put business logic in services or domain modules.
- Use fixtures for test setup and avoid shared mutable test state.

## Review Checklist

- [ ] Names reveal intent.
- [ ] Functions have one primary responsibility.
- [ ] Error handling is explicit and observable.
- [ ] Tests cover behavior, edge cases, and failure paths.
- [ ] Public interfaces are documented enough for callers.
- [ ] No hardcoded secrets, credentials, or environment-specific paths.
- [ ] Imports and dependencies are minimal.
- [ ] Framework-specific code does not leak into domain logic unnecessarily.

## Verification

```bash
# Go
go test ./...
go vet ./...

# Python
pytest
ruff check .
mypy .   # if configured
```
