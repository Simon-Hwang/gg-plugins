---
description: Test-driven development for Go or Python — write tests first, implement, verify 80%+ coverage, then fill gaps. Covers unit, integration, E2E, and coverage analysis.
argument-hint: "[feature description | file/package to cover]"
---

# TDD — Test-Driven Development

Apply the RED → GREEN → REFACTOR cycle for Go or Python. Delegates to `tdd-guide` and `e2e-runner` agents, with language-specific build resolvers on failure.

**Input**: $ARGUMENTS

---

## Step 1 — Detect Language and Context

```bash
# Detect project language
ls go.mod pyproject.toml setup.py setup.cfg 2>/dev/null
```

- **Go**: use `golang-testing` patterns + `tdd-guide` agent
- **Python**: use `python-testing` patterns + `tdd-guide` agent
- **Both present**: ask which stack or detect from changed files

Read existing test files to understand project conventions before writing new tests.

---

## Step 2 — Delegate to `tdd-guide`

Invoke the `tdd-guide` agent with the task from `$ARGUMENTS`.

The agent enforces:

1. **RED** — Write a failing test that specifies the desired behavior. Verify it fails with the right error, not a panic or import error.
2. **GREEN** — Write the minimal implementation to make the test pass.
3. **REFACTOR** — Clean up while keeping tests green. Apply `coding-standards` and `error-handling` skills.
4. **REPEAT** — Next behavior slice.

### Go test commands

```bash
go test ./...                     # All tests
go test -run TestFunctionName ./pkg/...   # Specific test
go test -cover ./...              # Coverage
go test -coverprofile=cover.out ./... && go tool cover -func=cover.out
go test -race ./...               # Race detection
```

### Python test commands

```bash
pytest                            # All tests
pytest tests/test_feature.py -v  # Specific file
pytest --cov=src --cov-report=term-missing  # Coverage
pytest -x --tb=short             # Stop on first failure
```

---

## Step 3 — Coverage Analysis

After GREEN, run coverage and identify gaps:

| Target | Threshold |
|--------|-----------|
| Critical business logic | 100% |
| Public API handlers | 90%+ |
| General code | 80%+ |
| Generated / boilerplate | Exclude |

For each file below threshold:
1. List untested functions and branches
2. Add tests for: happy path → error paths → edge cases → branch coverage

---

## Step 4 — E2E Validation (optional)

If `$ARGUMENTS` mentions API, workflow, or cross-service behavior, invoke `e2e-runner` to:
- Test the HTTP API end-to-end
- Validate database state transitions
- Verify auth flows, queue consumers, and webhook delivery

Use `e2e-testing` skill patterns for fixture management and stable assertions.

---

## Step 5 — Build Error Recovery

If the build fails during the cycle, delegate automatically:
- **Go**: `go-build-resolver` agent — fixes `go build`, `go vet`, import errors
- **Python/generic**: `build-error-resolver` agent — fixes pytest import errors, mypy failures, ruff violations

---

## Step 6 — Summary

Report:
```
TDD Session Complete
─────────────────────────────────
Language:   Go | Python
Tests written:   N new tests
Coverage:   before XX% → after YY%   [PASS / BELOW TARGET]
Build:      PASS | FAIL
E2E:        PASS | skipped
─────────────────────────────────
Next: /gg:review to audit implementation quality
```

---

## Skills activated

- `tdd-workflow` — RED/GREEN/REFACTOR discipline
- `golang-testing` or `python-testing` — language-specific patterns
- `e2e-testing` — end-to-end test patterns
- `error-handling` — proper error assertions in tests
- `coding-standards` — test naming and structure conventions

## Related commands

- `/gg:review` — review implementation after TDD
- `/gg:build-fix` — fix persistent build errors
- `/gg:refactor` — clean up code after tests are green
