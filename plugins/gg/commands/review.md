---
description: Comprehensive code review — language-specific agents, quality standards, security checks, silent-failure detection, and GitHub PR review with inline comment publishing.
argument-hint: "[path | --pr <number|url> | --strict | --security-only]"
---

# Review — Code Quality Analysis & PR Review

Runs language-aware review using specialized agents: `go-reviewer` or `python-reviewer`, plus `code-reviewer`, `security-reviewer`, and `silent-failure-hunter`. For GitHub PR reviews, fetches the diff, posts inline comments, and publishes an APPROVE / REQUEST CHANGES / BLOCK verdict. For high-stakes output, adds a `santa-method` dual-review gate.

**Input**: $ARGUMENTS

---

## Mode Selection

If `$ARGUMENTS` contains a PR number, PR URL, or `--pr`:
→ Jump to **PR Review Mode** below.

Otherwise:
→ Use **Local Review Mode**.

---

## Local Review Mode

### Step 1 — Detect Scope

```bash
git diff --name-only HEAD        # Uncommitted changes
git diff --name-only HEAD~1      # Last commit
```

Group changed files by language:
- `.go` → Go review track
- `.py` → Python review track
- Mixed → run both tracks in parallel

---

### Step 2 — Static Analysis

**Go:**
```bash
go vet ./...
staticcheck ./...     # if installed
golangci-lint run     # if installed
govulncheck ./...     # if installed
go build -race ./...  # race detector
```

**Python:**
```bash
mypy .
ruff check .
bandit -r .           # security
pip-audit             # dependency audit (if installed)
```

Record all tool findings before proceeding.

---

### Step 3 — Language-Specific Agent Review

Invoke the appropriate agent based on detected language:

- **Go files present** → delegate to `go-reviewer` agent
  - Checks: idiomatic Go, concurrency patterns, error wrapping, goroutine safety, interface satisfaction, performance
- **Python files present** → delegate to `python-reviewer` agent
  - Checks: PEP 8, type hints, Pythonic idioms, context managers, mutable defaults, comprehension opportunities
- **Both or unclear** → delegate to `code-reviewer` agent for generic quality review

Use the `coding-standards` skill as the baseline reference for what "correct" looks like in this codebase.

---

### Step 4 — Error Handling Audit

Invoke `silent-failure-hunter` agent to detect:
- Swallowed errors (empty `catch`, `_ = err`, bare `except`)
- Missing error propagation
- Bad fallback values that mask real failures
- Unhandled goroutine panics

Use `error-handling` skill patterns to verify remediation.

---

### Step 5 — Security Review

Invoke `security-reviewer` agent to check:
- SQL injection / command injection
- Hardcoded secrets or tokens
- Auth and authorization gaps
- Unsafe deserialization
- Path traversal, SSRF, XSS
- Missing input validation at boundaries

Alternatively, use `security-review` skill checklist for a structured walkthrough.

If `--security-only` is passed, run Steps 4–5 only and skip language-specific review.

---

### Step 6 — PR Test Analysis (if reviewing a PR diff locally)

Invoke `pr-test-analyzer` agent to assess:
- Behavioral test coverage for the change
- Whether tests actually prevent real bugs
- Missing edge cases in test suite

---

### Step 7 — High-Stakes Gate (optional)

If `--strict` is passed or the change touches: auth, payments, PII, public API contracts, or production migrations — activate `santa-method`:

Two independent review passes must both conclude the change is safe before producing a PASS verdict.

---

### Step 8 — Local Review Report

```
Code Review Report
─────────────────────────────────────────
Language(s):    Go | Python | Mixed
Files reviewed: N

Static Analysis:
  go vet:        PASS / FAIL
  staticcheck:   PASS / FAIL / skipped
  mypy:          PASS / FAIL / skipped
  ruff:          PASS / FAIL / skipped

Agent Review:
  CRITICAL: N   (must fix before merge)
  HIGH:     N   (should fix before merge)
  MEDIUM:   N   (recommended)
  LOW:      N   (optional)

Silent Failures: N found
Security:        N issues (CRITICAL: N / HIGH: N)

Verdict: PASS: APPROVE | REQUEST CHANGES | BLOCK
─────────────────────────────────────────
```

**Block merge if any CRITICAL or HIGH issues found.**

---

## PR Review Mode

Comprehensive GitHub PR review — fetches diff, reads full files, runs validation, posts review.

### Phase 1 — FETCH

Parse input to determine PR:

| Input | Action |
|---|---|
| Number (e.g. `42`) | Use as PR number |
| URL (`github.com/.../pull/42`) | Extract PR number |
| Branch name | Find PR via `gh pr list --head <branch>` |

```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <NUMBER>
```

If PR not found, stop with error. Store PR metadata for later phases.

### Phase 2 — CONTEXT

Build review context:

1. **Project rules** — Read `CLAUDE.md`, `.claude/docs/`, and any contributing guidelines
2. **Planning artifacts** — Check `.claude/prds/`, `.claude/plans/`, `.claude/reviews/`, and legacy `.claude/PRPs/{prds,plans,reports,reviews}/` for context related to this PR
3. **PR intent** — Parse PR description for goals, linked issues, test plans
4. **Changed files** — List all modified files and categorize by type (source, test, config, docs)

### Phase 3 — REVIEW

Read each changed file **in full** (not just the diff hunks — surrounding context is needed).

For PR reviews, fetch the full file contents at the PR head revision:
```bash
gh pr diff <NUMBER> --name-only | while IFS= read -r file; do
  gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d
done
```

Apply the review checklist across 7 categories:

| Category | What to Check |
|---|---|
| **Correctness** | Logic errors, off-by-ones, null handling, edge cases, race conditions |
| **Type Safety** | Type mismatches, unsafe casts, `any` usage, missing generics |
| **Pattern Compliance** | Matches project conventions (naming, file structure, error handling, imports) |
| **Security** | Injection, auth gaps, secret exposure, SSRF, path traversal, XSS |
| **Performance** | N+1 queries, missing indexes, unbounded loops, memory leaks, large payloads |
| **Completeness** | Missing tests, missing error handling, incomplete migrations, missing docs |
| **Maintainability** | Dead code, magic numbers, deep nesting, unclear naming, missing types |

Assign severity to each finding:

| Severity | Meaning | Action |
|---|---|---|
| **CRITICAL** | Security vulnerability or data loss risk | Must fix before merge |
| **HIGH** | Bug or logic error likely to cause issues | Should fix before merge |
| **MEDIUM** | Code quality issue or missing best practice | Fix recommended |
| **LOW** | Style nit or minor suggestion | Optional |

### Phase 4 — VALIDATE

Detect the project type from config files (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.), then run the appropriate commands:

**Node.js / TypeScript** (has `package.json`):
```bash
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null
npm run lint
npm test
npm run build
```

**Rust** (has `Cargo.toml`):
```bash
cargo clippy -- -D warnings
cargo test
cargo build
```

**Go** (has `go.mod`):
```bash
go vet ./...
go test ./...
go build ./...
```

**Python** (has `pyproject.toml` / `setup.py`):
```bash
pytest
mypy .
ruff check .
```

Run only the commands that apply to the detected project type. Record pass/fail for each.

### Phase 5 — DECIDE

Form recommendation based on findings:

| Condition | Decision |
|---|---|
| Zero CRITICAL/HIGH issues, validation passes | **APPROVE** |
| Only MEDIUM/LOW issues, validation passes | **APPROVE** with comments |
| Any HIGH issues or validation failures | **REQUEST CHANGES** |
| Any CRITICAL issues | **BLOCK** — must fix before merge |

Special cases:
- Draft PR → Always use **COMMENT** (not approve/block)
- Only docs/config changes → Lighter review, focus on correctness
- `--strict` flag → Activate `santa-method` dual-review gate before deciding

### Phase 6 — REPORT

Create review artifact at `.claude/reviews/pr-<NUMBER>-review.md`:

```markdown
# PR Review: #<NUMBER> — <TITLE>

**Reviewed**: <date>
**Author**: <author>
**Branch**: <head> → <base>
**Decision**: APPROVE | REQUEST CHANGES | BLOCK

## Summary
<1-2 sentence overall assessment>

## Findings

### CRITICAL
<findings or "None">

### HIGH
<findings or "None">

### MEDIUM
<findings or "None">

### LOW
<findings or "None">

## Validation Results

| Check | Result |
|---|---|
| Type check | Pass / Fail / Skipped |
| Lint | Pass / Fail / Skipped |
| Tests | Pass / Fail / Skipped |
| Build | Pass / Fail / Skipped |

## Files Reviewed
<list of files with change type: Added/Modified/Deleted>
```

### Phase 7 — PUBLISH

Post the review to GitHub:

```bash
# If APPROVE
gh pr review <NUMBER> --approve --body "<summary of review>"

# If REQUEST CHANGES
gh pr review <NUMBER> --request-changes --body "<summary with required fixes>"

# If COMMENT only (draft PR or informational)
gh pr review <NUMBER> --comment --body "<summary>"
```

For inline comments on specific lines:
```bash
gh api "repos/{owner}/{repo}/pulls/<NUMBER>/reviews" \
  -f event="COMMENT" \
  -f body="<overall summary>" \
  --input comments.json  # [{"path": "file", "line": N, "body": "comment"}, ...]
```

### Phase 8 — OUTPUT

```
PR #<NUMBER>: <TITLE>
Decision: <APPROVE|REQUEST_CHANGES|BLOCK>

Issues: <critical_count> critical, <high_count> high, <medium_count> medium, <low_count> low
Validation: <pass_count>/<total_count> checks passed

Artifacts:
  Review: .claude/reviews/pr-<NUMBER>-review.md
  GitHub: <PR URL>

Next steps:
  - <contextual suggestions based on decision>
```

### Edge Cases

- **No `gh` CLI**: Fall back to local review mode (read the diff, skip GitHub publish). Warn user.
- **Diverged branches**: Suggest `git fetch origin && git rebase origin/<base>` before review.
- **Large PRs (>50 files)**: Warn about review scope. Focus on source changes first, then tests, then config/docs.

---

## Skills activated

- `coding-standards` — baseline quality reference
- `error-handling` — error pattern verification
- `security-review` — security checklist
- `golang-patterns` / `python-patterns` — language idioms
- `santa-method` — dual-review gate (`--strict` mode or high-stakes PRs)
- `git-workflow` — understanding PR context (branch, commits, base)
- `github-ops` — posting review comments and approval via `gh`

## Agents invoked

- `go-reviewer` — Go-specific language and idiom review (local mode)
- `python-reviewer` — Python-specific language and idiom review (local mode)
- `code-reviewer` — generic quality review (mixed or unclear language)
- `silent-failure-hunter` — swallowed errors and bad fallbacks (local mode)
- `security-reviewer` — security audit (both modes)
- `pr-test-analyzer` — test coverage adequacy
- `code-architect` — architecture layer analysis for complex systems (optional)

## Related commands

- `/gg:tdd` — add missing tests identified in review
- `/gg:refactor` — clean up issues found in review
- `/gg:security-scan` — scan Claude Code config surfaces (agent harness security)
- `/gg:ship` — full pre-release gate that includes this review as a sub-step
