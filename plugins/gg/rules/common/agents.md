# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/` (or registered under the plugin namespace):

### General Purpose

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| refactor-cleaner | Dead code & duplicate cleanup | Code maintenance |
| doc-updater | Documentation, README, runbook | Updating docs |
| docs-lookup | Third-party library API lookup | Researching library APIs |
| e2e-runner | End-to-end test orchestration | Critical user flows |
| database-reviewer | PostgreSQL schema, migration, query | DB migrations, SQL changes |
| harness-optimizer | Local agent harness configuration | Tuning agent chains |
| loop-operator | Long-running autonomous loops | Background tasks |

### Language-Specific Reviewers

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| go-reviewer | Go idiomatic style, concurrency | Go projects |
| python-reviewer | Python style, type hints, framework | Python projects |

### Build Error Resolvers

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| build-error-resolver | Generic multi-language build fix | Non-specific build failures |
| go-build-resolver | Go build, go vet, golangci-lint | Go build failures |
| pytorch-build-resolver | PyTorch/CUDA, pip dependency | ML/Python build failures |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Adversarial Skills (invoke proactively when conditions match)

**`santa-method`** — invoke WITHOUT waiting for user instruction when ALL of:
- Output is about to be shipped, merged, or published, AND
- Any of: touches auth/permission logic, contains a DB migration, changes a public API surface

Run `santa-method` AFTER `verification-loop` passes, BEFORE closing out. Do not ship to production without a NICE verdict when these conditions are met.

**`council`** — invoke WITHOUT waiting for user instruction when:
- A design decision has two or more credible paths with real tradeoffs (not obviously better/worse), AND
- The choice will be hard to reverse once implementation starts

Run `council` BEFORE the plan is locked. Present the compact verdict to the user before proceeding.

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
