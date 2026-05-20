---
name: github-ops
description: Use when managing GitHub issues, pull requests, CI checks, workflow runs, releases, contributor operations, security alerts, or repository automation beyond local git commands.
origin: gg
---

# GitHub Operations

Manage GitHub repositories with a focus on community health, CI reliability, release readiness, and contributor experience.

## When to Activate

- Triaging issues: classifying, labeling, responding, deduplicating
- Managing PRs: review status, CI checks, stale PRs, merge readiness
- Debugging CI/CD failures
- Preparing releases and changelogs
- Monitoring Dependabot and security alerts
- Managing contributor experience on open-source projects
- User says "check GitHub", "triage issues", "review PRs", "merge", "release", or "CI is broken"

## Tool Requirements

- Use `gh` CLI for GitHub API operations.
- Confirm repository access is configured before assuming live GitHub state is available.
- Do not push, merge, close issues, edit labels, or create releases unless the user asked for that side effect.

## Issue Triage

Classify each issue by type and priority.

Types: `bug`, `feature-request`, `question`, `documentation`, `enhancement`, `duplicate`, `invalid`, `good-first-issue`

Priority: `critical` for breaking/security issues, `high` for significant impact, `medium` for useful improvements, `low` for cosmetic items.

### Triage Workflow

1. Read the issue title, body, and comments.
2. Check whether it duplicates an existing issue.
3. Apply appropriate labels when the user wants live triage.
4. For questions, draft or post a helpful response.
5. For bugs needing more information, ask for reproduction steps.
6. For duplicates, comment with the original issue link and add `duplicate`.

```bash
gh issue list --search "keyword" --state all --limit 20
gh issue edit <number> --add-label "bug,high-priority"
gh issue comment <number> --body "Thanks for reporting. Could you share reproduction steps?"
```

## PR Management

### Review Checklist

1. Check CI status: `gh pr checks <number>`.
2. Check mergeability: `gh pr view <number> --json mergeable`.
3. Check age and last activity.
4. Flag PRs with no review or no recent activity.
5. For community PRs, verify tests and contribution conventions.

```bash
gh pr checks <number>
gh pr view <number> --json number,title,mergeable,reviewDecision,statusCheckRollup
gh pr list --json number,title,updatedAt,reviewDecision
```

## CI/CD Operations

When CI fails:

1. Check the workflow run.
2. Identify the failing job and step.
3. Distinguish flaky tests from real failures.
4. For real failures, identify root cause and suggest or implement a focused fix.
5. For flaky tests, record the pattern and rerun only when that is the right next step.

```bash
gh run list --status failure --limit 10
gh run view <run-id> --log-failed
gh run rerun <run-id> --failed
```

## Release Management

When preparing a release:

1. Check CI is green on the release branch.
2. Review unreleased changes.
3. Generate or verify release notes.
4. Create the release only when the user explicitly asked for it.

```bash
gh pr list --state merged --base main --search "merged:>2026-03-01"
gh release create v1.2.0 --title "v1.2.0" --generate-notes
gh release create v1.3.0-rc1 --prerelease --title "v1.3.0 Release Candidate 1"
```

## Security Monitoring

```bash
gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[].security_advisory.summary'
gh api repos/{owner}/{repo}/secret-scanning/alerts --jq '.[].state'
gh pr list --label "dependencies" --json number,title
```

- Review dependency PRs before auto-merge.
- Flag critical or high severity alerts immediately.
- Confirm alert state before claiming risk is resolved.

## Quality Gate

Before completing a GitHub operations task:

- issues triaged have appropriate labels or a clear dry-run recommendation
- stale or blocked PRs have a stated next action
- CI failures have been investigated, not just rerun
- releases include accurate changelogs
- security alerts are acknowledged and tracked
