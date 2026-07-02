---
name: codex-agent-router
description: Use when GG workflows mention specialist agents such as planner, architect, code-explorer, go-reviewer, go-build-resolver, security-reviewer, database-reviewer, doc-updater, performance-optimizer, or when the user asks Codex to use GG agents.
origin: GG Codex adapter
---

# Codex Agent Router

This skill adapts GG's Claude Code agent playbooks to Codex. The source prompts live under `../../agents/`. They are not Codex-native named agent registrations, but they are authoritative role/playbook files.

## How To Apply Agents In Codex

1. Select the relevant agent file from the catalog below.
2. Read the file before applying the role.
3. If no explicit delegation was requested, apply the agent's process locally as a specialist lens.
4. If the user explicitly asks for subagents, parallel agents, or delegation, spawn Codex multi-agents and include the relevant agent prompt content in the delegated task.
5. Keep delegated write scopes disjoint and review returned changes before final integration.

## Agent Catalog

Planning and architecture:

- `planner` -> `../../agents/planner.md`
- `architect` -> `../../agents/architect.md`
- `code-architect` -> `../../agents/code-architect.md`
- `code-explorer` -> `../../agents/code-explorer.md`

Implementation and repair:

- `tdd-guide` -> `../../agents/tdd-guide.md`
- `build-error-resolver` -> `../../agents/build-error-resolver.md`
- `go-build-resolver` -> `../../agents/go-build-resolver.md`
- `pytorch-build-resolver` -> `../../agents/pytorch-build-resolver.md`
- `refactor-cleaner` -> `../../agents/refactor-cleaner.md`
- `code-simplifier` -> `../../agents/code-simplifier.md`

Review, security, and quality:

- `code-reviewer` -> `../../agents/code-reviewer.md`
- `go-reviewer` -> `../../agents/go-reviewer.md`
- `python-reviewer` -> `../../agents/python-reviewer.md`
- `security-reviewer` -> `../../agents/security-reviewer.md`
- `database-reviewer` -> `../../agents/database-reviewer.md`
- `performance-optimizer` -> `../../agents/performance-optimizer.md`
- `silent-failure-hunter` -> `../../agents/silent-failure-hunter.md`
- `pr-test-analyzer` -> `../../agents/pr-test-analyzer.md`
- `harness-optimizer` -> `../../agents/harness-optimizer.md`

Docs, lookup, and operations:

- `doc-updater` -> `../../agents/doc-updater.md`
- `docs-lookup` -> `../../agents/docs-lookup.md`
- `evidence-claim-analyst` -> `../../agents/evidence-claim-analyst.md`
- `evidence-verdict-reviewer` -> `../../agents/evidence-verdict-reviewer.md`
- `knowledge-architect` -> `../../agents/knowledge-architect.md`
- `evidence-knowledge-writer` -> `../../agents/evidence-knowledge-writer.md`
- `knowledge-synthesis-reviewer` -> `../../agents/knowledge-synthesis-reviewer.md`
- `knowledge-publish-planner` -> `../../agents/knowledge-publish-planner.md`
- `semantic-diff-reviewer` -> `../../agents/semantic-diff-reviewer.md`
- `e2e-runner` -> `../../agents/e2e-runner.md`
- `loop-operator` -> `../../agents/loop-operator.md`

Frontend/design adversarial loop:

- `a11y-architect` -> `../../agents/a11y-architect.md`
- `gan-planner` -> `../../agents/gan-planner.md`
- `gan-generator` -> `../../agents/gan-generator.md`
- `gan-evaluator` -> `../../agents/gan-evaluator.md`

## Coordination Rule

When a GG command says "delegate to agent X", interpret that in Codex as "use agent X's playbook". Only spawn a real Codex subagent when the user has authorized delegation or parallel agent work.
