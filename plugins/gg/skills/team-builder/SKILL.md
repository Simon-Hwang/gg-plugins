---
name: team-builder
description: Use when composing multiple available agents for independent parallel analysis, review, planning, security, database, or implementation-adjacent work.
origin: gg
---

# Team Builder

Interactive menu for browsing and composing agent teams on demand. Works with flat or domain-subdirectory agent collections.

## When to Use

- You have multiple agent personas and want to pick which ones to use for a task.
- You want to compose an ad-hoc team from different domains, such as security, database, architecture, or framework review.
- You want to browse what agents are available before deciding.

## Prerequisites

Agent files must be markdown files containing a persona prompt: identity, rules, workflow, and deliverables. The first `# Heading` is used as the agent name and the first paragraph as the description.

GG commonly uses a flat agent layout:

```text
agents/
├── planner.md
├── architect.md
├── tdd-guide.md
├── python-reviewer.md
├── go-reviewer.md
├── database-reviewer.md
└── security-reviewer.md
```

Subdirectory layouts are also supported when present.

## Discovery

Agents are discovered via two methods, merged and deduplicated by agent name:

1. `claude agents` command, when available, to list plugin, user, and built-in agents known to the CLI.
2. File glob fallback for reading local agent content:
   - `./agents/**/*.md` and `./agents/*.md`
   - `~/.claude/agents/**/*.md` and `~/.claude/agents/*.md`

Earlier sources take precedence when names collide: user agents, then plugin agents, then built-in agents.

## How It Works

### Step 1: Discover Available Agents

Run `claude agents` when available. Parse each line:

- Plugin agents may be prefixed with `plugin-name:`.
- User agents usually have no prefix.
- Built-in agents are skipped unless the user explicitly asks to include them.

For markdown files:

- Subdirectory layout: extract the domain from the parent folder.
- Flat layout: collect filename prefixes before the first `-`; a prefix qualifies as a domain only if it appears in two or more filenames.
- Extract the agent name from the first `# Heading`.
- Extract a one-line summary from the first paragraph after the heading.

If no agents are found, report that no agents were found and suggest verifying the install.

### Step 2: Present Domain Menu

```text
Available agent domains:
1. GG Reviewers - Go Reviewer, Python Reviewer, Security Reviewer
2. Planning - Planner, Architect
3. Delivery - TDD Guide, Build Error Resolver

Pick domains or name specific agents:
```

- Skip domains with zero agents.
- Show agent count per domain.
- Keep the menu short.

### Step 3: Handle Selection

Accept flexible input:

- Numbers: `1,3`
- Names: `security + database`
- Domain phrases: `all reviewers`

If more than five agents are selected, ask the user to narrow the list.

Confirm selection:

```text
Selected: Security Reviewer + Database Reviewer
What should they work on?
```

### Step 4: Spawn Agents in Parallel

1. Read each selected agent's markdown file.
2. Prompt for the task description if not already provided.
3. Spawn all agents in parallel using the available subagent mechanism.
4. If an agent fails, note the failure and continue with results from agents that succeeded.

Agents should work independently. Do not use this pattern when agents must debate or exchange state.

### Step 5: Synthesize Results

Collect all outputs and present a unified report:

- results grouped by agent
- agreements across agents
- conflicts or tensions between recommendations
- recommended next steps

If only one agent was selected, skip synthesis and present the output directly.

## Rules

- Dynamic discovery only. Never hardcode agent lists as the source of truth.
- Maximum five agents per team.
- Dispatch independent agents in parallel when possible.
- Prefer GG-specific agents for Go, Python, database, security, and delivery workflows.
