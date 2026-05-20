---
name: verification-loop
description: "A comprehensive verification system for Claude Code sessions."
origin: gg
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

### Phase 1: Build Verification
```bash
# Go
go build ./... 2>&1 | tail -20

# Python
python -m py_compile $(git diff --name-only HEAD -- '*.py') 2>&1 | head -20
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
# Go (vet covers most type-level issues)
go vet ./... 2>&1 | head -30

# Python
mypy . 2>&1 | head -30          # if configured
```

Report all errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
# Go
golangci-lint run 2>&1 | head -30    # if available
go vet ./... 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### Phase 4: Test Suite
```bash
# Go
go test ./... -cover 2>&1 | tail -50

# Python
pytest --cov=. --cov-report=term-missing 2>&1 | tail -50

# Target: 80% minimum coverage
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
# Check for hardcoded secrets
grep -rn "sk-\|api_key\s*=\|password\s*=\|secret\s*=" \
  --include="*.go" --include="*.py" . 2>/dev/null | grep -v "_test\.\|test_\|\.md" | head -10

# Go
govulncheck ./... 2>/dev/null | head -20    # if available

# Python
pip-audit 2>/dev/null | head -20            # if available
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function or handler
- After finishing a migration or schema change
- Before moving to the next task

Run the verification phases above.
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
