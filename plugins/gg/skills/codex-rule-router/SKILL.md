---
name: codex-rule-router
description: Use when applying GG coding, review, testing, security, performance, workflow, Go, or Python rule packs in Codex, especially for Go/Python backend repositories.
origin: GG Codex adapter
---

# Codex Rule Router

This skill adapts GG rule packs to Codex. Claude Code may auto-load rule files from `~/.claude/rules/`, but Codex should read and apply the source rule files from this plugin when relevant.

## Rule Packs

Common rules:

- agents: `../../rules/common/agents.md`
- code review: `../../rules/common/code-review.md`
- coding style: `../../rules/common/coding-style.md`
- development workflow: `../../rules/common/development-workflow.md`
- git workflow: `../../rules/common/git-workflow.md`
- hooks: `../../rules/common/hooks.md`
- patterns: `../../rules/common/patterns.md`
- performance: `../../rules/common/performance.md`
- security: `../../rules/common/security.md`
- testing: `../../rules/common/testing.md`

Go rules:

- coding style: `../../rules/golang/coding-style.md`
- hooks: `../../rules/golang/hooks.md`
- patterns: `../../rules/golang/patterns.md`
- security: `../../rules/golang/security.md`
- testing: `../../rules/golang/testing.md`

Python rules:

- coding style: `../../rules/python/coding-style.md`
- patterns: `../../rules/python/patterns.md`
- security: `../../rules/python/security.md`
- testing: `../../rules/python/testing.md`

## Application

Read only the rule files relevant to the current task. Apply them as guidance for implementation, review, tests, and verification. If a rule conflicts with explicit user instructions, active system/developer instructions, or the target repository's existing conventions, follow the higher-priority instruction and call out the tradeoff when it matters.

For Go work, default to common + Go rules. For Python work, default to common + Python rules. For mixed repositories, inspect `go.mod`, `pyproject.toml`, `requirements*.txt`, and existing tests before choosing.
