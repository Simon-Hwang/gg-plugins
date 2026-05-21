---
description: Pre-release gate — verify, review, security-check, update docs, tag, and prepare deployment. Blocks on unresolved CRITICAL or HIGH findings before merge.
argument-hint: "[--pr <number> | --tag <version> | --strict | --deploy]"
---

# Ship — Release Workflow

Orchestrates the full pre-release quality gate: verification → code review → security → test analysis → docs sync → optional deploy preparation. Uses `santa-method` dual-review for high-stakes releases.

**Input**: $ARGUMENTS

---

## Step 1 — Verification Gate

Apply `verification-loop` skill to establish that the current state is deployable:

```bash
# Go
go build ./...
go vet ./...
go test -race ./...

# Python
pytest
mypy .
ruff check .

# Both
git diff --stat HEAD  # uncommitted changes?
git status            # untracked files?
```

**BLOCK** if any of these fail. Fix with `/gg:build-fix`, `/gg:tdd`, or `/gg:refactor` first.

---

## Step 2 — Code Review

Invoke `code-reviewer` agent for a comprehensive diff review:

```bash
git diff main...HEAD --name-only   # or compare to base branch
```

For PR-based releases, use the PR number from `--pr <N>` with the full `/gg:review --pr <N>` workflow.

The agent checks:
- Correctness, edge cases, race conditions
- Pattern compliance with project conventions
- Missing error handling or null checks
- Completeness (migrations, config changes, tests)

**BLOCK** on CRITICAL or HIGH findings.

---

## Step 3 — Security Audit

Invoke `security-reviewer` agent.

Apply `security-review` skill checklist:

```bash
# Scan for hardcoded secrets
rg -n "password|secret|token|api_key|apikey" --type go --type py -i | grep -v "_test\."

# Check for injection patterns
rg -n "fmt.Sprintf.*sql|exec\.Command|os\.System|eval\|exec(" --type go --type py
```

**BLOCK** on any CRITICAL security finding. Rotate exposed secrets immediately.

---

## Step 4 — PR Test Coverage Analysis

Invoke `pr-test-analyzer` agent to verify:
- New code has behavioral test coverage
- Tests prevent real bugs, not just satisfy coverage metrics
- Edge cases in the feature are exercised

If test coverage is insufficient, generate the missing tests with `/gg:tdd` before proceeding.

---

## Step 5 — Dual-Review Gate for High-Stakes Releases

If `--strict` is passed, OR the release touches:
- Authentication / authorization logic
- Payment processing or financial data
- PII or regulated data
- Public API contracts (breaking changes)
- Production database migrations

Activate `santa-method` skill:
- Two independent review agents evaluate all findings from Steps 2–4
- Both must return a PASS verdict before proceeding
- Any disagreement triggers a resolution loop until convergence

---

## Step 6 — Documentation Sync

Invoke `doc-updater` agent:

```bash
git diff main...HEAD --name-only | grep -v "_test\."  # source files changed
ls .rag/ 2>/dev/null && echo "RAG exists"              # check for RAG
```

- If `.rag/_manifest.json` exists → run RAG incremental sync (same as `/gg:rag-sync`)
- Always → update README, API docs, migration notes, and runbook for any changed interfaces

---

## Step 7 — Git Workflow Prep

Apply `git-workflow` skill:

```bash
git log --oneline main..HEAD   # commits in this release
git diff main...HEAD --stat    # change summary
```

Generate:
- **Commit message** (if not already committed): Conventional Commits format (`feat:`, `fix:`, `chore:`)
- **PR description** template: summary, motivation, testing, screenshots, migration notes
- **Changelog entry** (if project uses CHANGELOG.md)

Apply `github-ops` skill if creating a GitHub release:
```bash
gh release create v<VERSION> --title "v<VERSION>" --notes "<release notes>"
gh pr merge <PR> --squash --delete-branch   # if approved
```

---

## Step 8 — Deploy Preparation (if --deploy)

Apply `deployment-patterns` skill:

Pre-deploy checklist:
- [ ] Feature flags configured (if using feature flags)
- [ ] Database migrations run in correct order (before code deploy if additive; after if removal)
- [ ] Environment variables documented in `.env.example`
- [ ] Health check endpoint responds correctly
- [ ] Rollback plan documented: what to do if error rate spikes

Apply `docker-patterns` skill if containerized:
```bash
docker build -t app:v<VERSION> .
docker run --rm app:v<VERSION> health-check
```

---

## Step 9 — Release Report

```
Ship Report
─────────────────────────────────────────
Branch/PR:  <head> → <base>
Version:    <tag or "unreleased">
─────────────────────────────────────────
Verification:   PASS: / FAIL: (blocked)
Code Review:    CRITICAL:N HIGH:N MEDIUM:N
Security:       CRITICAL:N HIGH:N
Test Coverage:  ADEQUATE / INSUFFICIENT
Dual-Review:    PASS: (2/2) | skipped | FAIL: (1/2)
Docs:           synced / no RAG / skipped

Verdict: READY TO SHIP | BLOCKED (N issues require fixes)
─────────────────────────────────────────
```

**Only proceed with deploy/merge if verdict is READY TO SHIP.**

---

## Skills activated

- `verification-loop` — build and test gate before everything else
- `security-review` — security checklist for the change
- `santa-method` — dual-review for high-stakes releases (--strict)
- `git-workflow` — commit messages, PR descriptions, changelog
- `github-ops` — PR merge, release tag, review posting
- `deployment-patterns` — deploy checklist and rollback planning
- `docker-patterns` — container build and health verification

## Agents invoked (in sequence)

1. `code-reviewer` — overall code quality
2. `security-reviewer` — security audit
3. `pr-test-analyzer` — test coverage adequacy
4. `doc-updater` — documentation sync

## Related commands

- `/gg:review` — detailed code review earlier in the cycle
- `/gg:review --pr <N>` — GitHub PR review with inline comments
- `/gg:rag-sync` — documentation sync (standalone)
- `/gg:security-scan` — scan Claude Code config security (separate from code security)
