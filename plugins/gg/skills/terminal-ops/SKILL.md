---
name: terminal-ops
description: Use when a GG task depends on command output, git state, CI failure logs, local verification, or a narrow repo fix with exact evidence.
origin: gg
---

# Terminal Ops

Use this when the user wants real repo execution: run commands, inspect git state, debug CI or builds, make a narrow fix, and report exactly what changed and what was verified.

This skill is intentionally narrower than general coding guidance. It is an operator workflow for evidence-first terminal execution.

## Skill Stack

Pull these GG skills into the workflow when relevant:

- `verification-loop` for exact proving steps after changes
- `tdd-workflow` when the right fix needs regression coverage
- `security-review` when secrets, auth, or external inputs are involved
- `github-ops` when the task depends on CI runs, PR state, or release status
- `git-workflow` when branch, commit, or PR readiness matters

## When to Use

- user says "fix", "debug", "run this", "check the repo", or "push it"
- the task depends on command output, git state, test results, or a verified local fix
- the answer must distinguish changed locally, verified locally, committed, and pushed

## Guardrails

- inspect before editing
- stay read-only if the user asked for audit or review only
- prefer repo-local scripts and helpers over improvised ad hoc wrappers
- do not claim fixed until the proving command was rerun
- do not claim pushed unless the branch actually moved upstream
- do not use destructive git commands unless the user explicitly approves them

## Workflow

### 1. Resolve the Working Surface

Settle:

- exact repo path
- branch
- local diff state
- requested mode:
  - inspect
  - fix
  - verify
  - push

### 2. Read the Failing Surface First

Before changing anything:

- inspect the error
- inspect the file or test
- inspect git state
- use already-supplied logs or context before re-reading blindly

### 3. Keep the Fix Narrow

Solve one dominant failure at a time:

- use the smallest useful proving command first
- only escalate to a bigger build or test pass after the local failure is addressed
- if a command keeps failing with the same signature, stop broad retries and narrow scope

### 4. Report Exact Execution State

Use exact status words:

- inspected
- changed locally
- verified locally
- committed
- pushed
- blocked

## Output Format

```text
SURFACE
- repo
- branch
- requested mode

EVIDENCE
- failing command / diff / test

ACTION
- what changed

STATUS
- inspected / changed locally / verified locally / committed / pushed / blocked
```

## Pitfalls

- do not work from stale memory when the live repo state can be read
- do not widen a narrow fix into repo-wide churn
- do not use destructive git commands
- do not ignore unrelated local work

## Verification

- the response names the proving command or test
- git-related work names the repo path and branch
- any push claim includes the target branch and exact result
