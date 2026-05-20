---
description: Agent system health check — audit Claude Code config, agent harness, context budget, autonomous loops, and workspace surfaces. Produces a prioritized remediation plan.
argument-hint: "[--harness | --context | --security | --workspace | --loops | --eval]"
---

# Agent Health — AI Agent System Health Check

Comprehensive health check for your Claude Code / AI agent infrastructure. Audits the harness configuration, context efficiency, security surface, workspace setup, and autonomous loop health. Produces a scorecard with prioritized fixes.

**Input**: $ARGUMENTS

---

## Step 1 — Select Audit Tracks

Run all tracks by default. Use flags to scope:

| Flag | Track | Primary Skill/Agent |
|------|-------|---------------------|
| `--harness` | Agent harness config quality and scoring | `harness-optimizer` agent + `/gg:harness-audit` |
| `--context` | Context window budget and bloat | `context-budget` skill |
| `--security` | Claude Code config security scan | `security-scan` skill |
| `--workspace` | MCP servers, plugins, connectors inventory | `workspace-surface-audit` skill |
| `--loops` | Autonomous loop health and monitoring | `autonomous-loops` skill + `loop-operator` agent |
| `--eval` | Evaluation framework coverage | `eval-harness` skill |
| (none) | Run --harness + --context + --security + --workspace |

---

## Step 2 — Harness Audit (--harness)

Run the deterministic harness audit script:

```bash
node plugins/gg/scripts/harness-audit.js repo --format text
```

Or delegate to `harness-optimizer` agent for recommendations beyond the scorecard:
- Tool coverage gaps (which tools are registered vs which are needed)
- Context efficiency (large rules, bloated skills)
- Quality gates (verification hooks, test coverage gates)
- Memory persistence (instinct storage, ADR, learning)
- Security guardrails (permission scope, secret handling)
- Cost efficiency (model selection, token budget)

---

## Step 3 — Context Budget Audit (--context)

Apply `context-budget` skill to measure and reduce context consumption:

```bash
# Estimate token usage by component
find .claude -name "*.md" | xargs wc -w 2>/dev/null    # Rules + skills
find .claude -name "CLAUDE.md" | xargs wc -w 2>/dev/null
```

Identify bloat sources:
- **Rules**: which always-load rules are redundant or verbose?
- **Skills**: are any skills loaded every session but rarely used?
- **MCP servers**: are any MCP servers injecting large context without benefit?
- **Instincts**: is the instinct store growing with low-confidence entries?

Produce a token-savings plan ranked by impact:

| Source | Estimated Tokens | Recommendation |
|--------|-----------------|----------------|
| `rules/common/agents.md` | ~2,000 | Trim redundant tables |
| `skills/using-gg` | ~1,500 | Move to on-demand |
| ... | ... | ... |

Apply `strategic-compact` recommendations if the session itself is too long to continue.

---

## Step 4 — Security Scan (--security)

Scan Claude Code configuration surfaces for vulnerabilities:

```bash
npx agentshield scan --path ".claude" --format text
```

Or apply `security-scan` skill manually:
- `CLAUDE.md` — prompt injection risks, instruction overrides
- `settings.json` — overly broad permissions, shell access
- `hooks/` — executable hook scripts with dangerous commands
- MCP servers — shell transport, filesystem access, unpinned `npx`
- Agent definitions — prompts that handle untrusted content without defenses

See `/gg:security-scan` for the full AgentShield workflow.

---

## Step 5 — Workspace Surface Audit (--workspace)

Apply `workspace-surface-audit` skill to inventory what's available:

```bash
ls ~/.cursor/projects/*/mcps/ 2>/dev/null  # Cursor MCP servers
cat .claude/settings.json 2>/dev/null       # Claude Code config
ls .claude/ 2>/dev/null                     # Project surface
```

Produce:
- Enabled MCP servers and their capabilities
- Active plugins and skill sets
- Environment variables exposed
- Gaps between what's available and what GG skills need

Recommend the highest-value additions based on the project type (Go/Python/DB/ML).

---

## Step 6 — Autonomous Loop Health (--loops)

Apply `autonomous-loops` skill and `enterprise-agent-ops` skill:

```bash
# Check for running loop processes
ps aux | grep "claude\|agent" | grep -v grep
ls -la ~/.claude/loops/ 2>/dev/null  # Loop state files
```

Assess:
- Are loops progressing or stalled?
- Is observability in place (structured logs, metrics)?
- Are security boundaries enforced (no unreviewed writes to prod)?
- Is there a safe interrupt mechanism?

Delegate to `loop-operator` agent if a specific loop needs intervention.

---

## Step 7 — Evaluation Coverage (--eval)

Apply `eval-harness` skill:
- Are there eval datasets for critical agent behaviors?
- Are evals running in CI or manually?
- What's the current pass rate on known-good examples?
- Which agent behaviors lack eval coverage?

---

## Step 8 — Health Report

```
Agent System Health Report
─────────────────────────────────────────
Harness Score:   N/10  (from harness-audit script)
Context Budget:  ~N tokens loaded per session
Security Grade:  A | B | C | F
Workspace:       N MCP servers | N plugins | N skills
Loop Status:     N loops running | stalled | none
Eval Coverage:   N% behaviors covered
─────────────────────────────────────────
Top Remediation Actions:
  1. [CRITICAL] <action> → <file or command>
  2. [HIGH]     <action>
  3. [MEDIUM]   <action>
─────────────────────────────────────────
Next: Apply top-3 actions, then re-run /gg:agent-health
      Use /gg:harness-audit for detailed scorecard breakdown
      Use /gg:security-scan for full AgentShield analysis
```

---

## Skills activated

- `agent-architecture-audit` — deep 12-layer LLM application diagnostic
- `workspace-surface-audit` — MCP, plugin, and connector inventory
- `context-budget` — token consumption analysis and savings plan
- `eval-harness` — evaluation framework coverage assessment
- `enterprise-agent-ops` — long-running agent lifecycle and observability
- `autonomous-loops` — autonomous loop patterns and safety assessment
- `security-scan` — Claude Code configuration security scan

## Agents invoked

- `harness-optimizer` — harness config recommendations (--harness)
- `loop-operator` — loop intervention if stalled (--loops)

## Related commands

- `/gg:harness-audit` — deterministic harness scorecard (sub-component of this)
- `/gg:security-scan` — full AgentShield scan (sub-component of this)
- `/gg:task-trace` — inspect task-level event timeline
- `/gg:explore` — workspace surface audit as part of onboarding
