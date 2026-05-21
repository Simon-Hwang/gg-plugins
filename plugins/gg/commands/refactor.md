---
description: Code cleanup and refactoring — remove dead code, fix error handling, simplify complexity, and enforce coding standards. Requires green tests before starting.
argument-hint: "[path | --dead-code | --errors | --simplify | --standards]"
---

# Refactor — Code Cleanup & Refactoring

Safely clean up and improve code while keeping behavior unchanged. Runs tests first to establish a green baseline, then delegates to `refactor-cleaner`, `code-simplifier`, and `silent-failure-hunter` agents.

**Input**: $ARGUMENTS

---

## Step 0 — Establish Green Baseline

**Never refactor with a failing build or red tests.**

```bash
# Go
go build ./... && go test ./...

# Python
pytest --tb=short
```

If tests fail, stop and fix them first with `/gg:tdd` or `/gg:build-fix`.

---

## Step 1 — Determine Refactor Scope

From `$ARGUMENTS`, identify the target:

| Flag | Focus |
|------|-------|
| `--dead-code` | Unused functions, variables, imports, exported symbols |
| `--errors` | Swallowed errors, missing propagation, bad fallbacks |
| `--simplify` | Functions > 50 lines, nesting > 4 levels, duplicate helpers |
| `--standards` | Naming, file organization, import order, comment quality |
| (none) | Full scan across all four dimensions |

Target path defaults to the current directory.

---

## Step 2 — Dead Code Elimination

Invoke `refactor-cleaner` agent:

**Go:**
```bash
deadcode ./...           # if installed
rg -n "^func " --type go | sort  # find functions
# Check for unexported symbols with no callers
```

**Python:**
```bash
vulture .                # if installed — finds unused code
rg -n "^def " --type py  # find functions
```

Remove:
- Unused imports and packages
- Unexported/private functions with no callers
- Duplicate helper functions (consolidate to one location)
- Commented-out code blocks (delete, not archive)
- Obsolete feature flags and dead branches

**Rule**: only delete code that is provably unreachable or unused. Verify with `rg` before deleting.

---

## Step 3 — Error Handling Audit

Invoke `silent-failure-hunter` agent to find:
- `_ = err` or ignored `error` returns
- Empty `catch`/`except` blocks
- Errors logged but not returned (lost errors)
- Fallback values that mask failures (e.g., returning empty slice on DB error)
- Missing context wrapping (`fmt.Errorf("...: %w", err)` in Go)

Apply `error-handling` skill patterns to fix:

**Go**: Wrap errors with context at each layer boundary:
```go
// Before
return err

// After
return fmt.Errorf("create user %s: %w", userID, err)
```

**Python**: Use typed exceptions and never bare `except`:
```python
# Before
try:
    result = db.query(sql)
except:
    return None  # silent failure

# After
try:
    result = db.query(sql)
except DatabaseError as e:
    raise ServiceError(f"query failed: {e}") from e
```

---

## Step 4 — Simplification

Invoke `code-simplifier` agent:

Look for:
- Functions > 50 lines → extract to named helpers
- Nesting depth > 4 levels → early return / guard clauses
- Duplicated logic (copy-paste) → extract shared utility
- Magic numbers → named constants with comments
- Complex boolean expressions → named predicate functions
- Large structs/classes → split by responsibility

Apply `coding-standards` skill for naming and structure conventions:
- Go: exported names use PascalCase; unexported use camelCase; packages are lowercase single words
- Python: `snake_case` functions/variables; `PascalCase` classes; `UPPER_CASE` constants

---

## Step 5 — Verify Behavior Unchanged

Re-run the full test suite and compare coverage:

```bash
# Go
go test -cover ./...

# Python
pytest --cov=src --cov-report=term-missing
```

Coverage must not decrease. If tests fail, the refactor introduced a regression — revert the last change.

---

## Step 6 — Summary

```
Refactor Complete
─────────────────────────────────────────
Scope:           <path> | <flags>
─────────────────────────────────────────
Dead code:       N symbols removed
Error handling:  N silent failures fixed
Simplification:  N functions extracted / N lines reduced
Standards:       N naming/structure issues fixed

Tests:           PASS: (before) → PASS: (after)
Coverage:        XX% → YY%  (must not decrease)
─────────────────────────────────────────
Next: /gg:review to confirm quality is acceptable before commit
```

---

## Skills activated

- `coding-standards` — naming, structure, import, readability rules
- `error-handling` — proper error propagation and wrapping patterns
- `tdd-workflow` — green baseline requirement and coverage gate

## Agents invoked

- `refactor-cleaner` — dead code, duplicates, unused imports
- `code-simplifier` — complexity reduction, clarity improvements
- `silent-failure-hunter` — swallowed errors and bad fallbacks

## Related commands

- `/gg:tdd` — add tests before refactoring untested code
- `/gg:review` — verify refactored code meets quality standards
- `/gg:diagnose` — if simplification reveals a deeper performance issue
