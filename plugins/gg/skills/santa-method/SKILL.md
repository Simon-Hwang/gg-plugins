---
name: santa-method
description: "Multi-agent adversarial verification with convergence loop. Two independent review agents must both pass before output ships. Use when output will be deployed, content accuracy matters, or hallucination risk is elevated."
origin: gg
credit: "Ronald Skelton - Founder, RapportScore.ai"
---

# Santa Method

Multi-agent adversarial verification framework. Make a list, check it twice. If it's naughty, fix it until it's nice.

The core insight: a single agent reviewing its own output shares the same biases, knowledge gaps, and systematic errors that produced the output. Two independent reviewers with no shared context break this failure mode.

## When to Activate

Invoke this skill when:
- Output will be deployed to production or consumed by end users
- Security-sensitive code (auth logic, permission checks, crypto)
- Database migrations (irreversible operations — dual review catches ordering issues)
- Public API design before publishing (interface, error codes, backward compatibility)
- Content accuracy matters (technical docs, runbooks, API references)
- Code ships without human review
- Hallucination risk is elevated (statistics, API references, version numbers)

Do NOT use for internal drafts, exploratory research, or tasks with deterministic verification — use `verification-loop` for those (build/lint/test). Run `verification-loop` first, Santa second.

## Architecture

```
┌─────────────┐
│  GENERATOR   │  Phase 1: Make a List
│  (Agent A)   │  Produce the deliverable
└──────┬───────┘
       │ output
       ▼
┌──────────────────────────────┐
│     DUAL INDEPENDENT REVIEW   │  Phase 2: Check It Twice
│                                │
│  ┌───────────┐ ┌───────────┐  │  Two agents, same rubric,
│  │ Reviewer B │ │ Reviewer C │  │  no shared context
│  └─────┬─────┘ └─────┬─────┘  │
│        │              │        │
└────────┼──────────────┼────────┘
         │              │
         ▼              ▼
┌──────────────────────────────┐
│        VERDICT GATE           │  Phase 3: Naughty or Nice
│                                │
│  B passes AND C passes → NICE  │  Both must pass.
│  Otherwise → NAUGHTY           │  No exceptions.
└──────┬──────────────┬─────────┘
       │              │
    NICE           NAUGHTY
       │              │
       ▼              ▼
   [ SHIP ]    ┌─────────────┐
               │  FIX CYCLE   │  Phase 4: Fix Until Nice
               │              │
               │ iteration++  │  Collect all flags.
               │ if i > MAX:  │  Fix all issues.
               │   escalate   │  Re-run both reviewers.
               │ else:        │  Loop until convergence.
               │   goto Ph.2  │
               └──────────────┘
```

## Phase Details

### Phase 1: Make a List (Generate)

Execute the primary task normally. Santa Method is a post-generation verification layer, not a generation strategy.

### Phase 2: Check It Twice (Independent Dual Review)

Spawn two review agents in parallel via the Task tool. Critical invariants:

1. **Context isolation** — neither reviewer sees the other's assessment
2. **Identical rubric** — both receive the same evaluation criteria
3. **Same inputs** — both receive the original spec AND the generated output
4. **Structured output** — each returns a typed verdict, not prose

Reviewer prompt shape:

```text
You are an independent quality reviewer. You have NOT seen any other review of this output.

## Task Specification
{task_spec}

## Output Under Review
{output}

## Evaluation Rubric
{rubric}

## Instructions
Evaluate the output against EACH rubric criterion. For each:
- PASS: criterion fully met, no issues
- FAIL: specific issue found (cite the exact problem)

Return your assessment as structured JSON:
{
  "verdict": "PASS" | "FAIL",
  "checks": [
    {"criterion": "...", "result": "PASS|FAIL", "detail": "..."}
  ],
  "critical_issues": ["..."],
  "suggestions": ["..."]
}

Be rigorous. Your job is to find problems, not to approve.
```

### Rubric Design

Every criterion must have an objective pass/fail condition.

| Criterion | Pass Condition | Failure Signal |
|-----------|---------------|----------------|
| Factual accuracy | All claims verifiable | Invented stats, wrong version numbers |
| Hallucination-free | No fabricated entities or URLs | Links that don't exist, fake quotes |
| Completeness | Every requirement addressed | Missing sections, skipped edge cases |
| Technical correctness | Code compiles/runs, algorithms sound | Syntax errors, logic bugs |
| Internal consistency | No contradictions within output | Section A says X, section B says not-X |
| Compliance | Passes project constraints | Banned patterns, security violations |

**Go/Python backend rubric extensions:**

```text
Code:
- Error handling: all error paths handled, no silent discards
- Nil/None safety: no unguarded pointer dereferences or NoneType accesses
- Concurrency: no data races (Go), no unprotected shared state (Python)
- SQL safety: parameterized queries only, no string interpolation
- Secret safety: no hardcoded credentials or API keys

Database migrations:
- Rollback plan present
- No destructive operations without backup assertion
- Index creation uses CONCURRENTLY (PostgreSQL)
- Migration is idempotent
```

### Phase 3: Naughty or Nice (Verdict Gate)

Both reviewers must pass. No partial credit.

```python
if review_b.verdict == "PASS" and review_c.verdict == "PASS":
    return "NICE"  # Ship it

# Merge flags from both reviewers, deduplicate
all_issues = dedupe(review_b.critical_issues + review_c.critical_issues)
return "NAUGHTY", all_issues
```

If only one reviewer catches an issue, that issue is real. The other reviewer's blind spot is exactly the failure mode Santa Method exists to eliminate.

### Phase 4: Fix Until Nice (Convergence Loop)

```
MAX_ITERATIONS = 3

for iteration in 1..MAX_ITERATIONS:
    if verdict == "NICE": ship output

    Fix all critical_issues only.
    Do NOT refactor or add unrequested changes.

    Re-run BOTH reviewers as fresh agents (no memory of previous round).

If iterations exhausted: escalate to human.
```

Critical: each review round uses **fresh agents**. Prior context creates anchoring bias.

## Implementation in Claude Code

Use the Task tool to spawn both reviewers in parallel:

```text
Launch two independent review agents simultaneously:

Agent 1 (Reviewer B):
  description: "Santa Reviewer B — independent quality check"
  prompt: [REVIEWER_PROMPT with task_spec, output, rubric]

Agent 2 (Reviewer C):
  description: "Santa Reviewer C — independent quality check"
  prompt: [same REVIEWER_PROMPT, same inputs, no cross-reference]

Collect both JSON verdicts. Apply verdict gate. Fix if NAUGHTY. Repeat with fresh agents.
```

## Failure Modes and Mitigations

| Failure Mode | Symptom | Mitigation |
|-------------|---------|------------|
| Rubber stamping | Both reviewers pass everything | Adversarial prompt: "Your job is to find problems, not to approve." |
| Subjective drift | Reviewers flag style, not errors | Tight rubric with objective pass/fail only |
| Fix regression | Fixing A introduces B | Fresh reviewers each round catch regressions |
| Infinite loop | Keep finding new issues | Max iteration cap (3). Escalate to human. |
| Cost explosion | Too many iterations on large outputs | Batch sampling: 15% sample, fix systematic patterns, re-sample |

## Integration with GG Skills

| Skill | Relationship |
|-------|-------------|
| `verification-loop` | Run first for deterministic checks (build/lint/test). Santa for semantic checks (accuracy, security logic). |
| `eval-harness` | Santa findings feed eval metrics. Track pass@k across Santa runs. |
| `continuous-learning-v2` | Repeated Santa failures on same criterion → learned instinct to avoid the pattern. |
| `security-review` | Santa with a security rubric provides dual-agent adversarial security review on top of checklist-based review. |

## Cost Analysis

Santa costs approximately 2-3× the token cost of generation per verification cycle.

```
Cost of Santa = generation_tokens + 2×(review_tokens/round) × avg_rounds
Cost of NOT Santa = debugging_time + incident_cost + trust_erosion
```

For batch operations, 15% sampling catches >90% of systematic issues at ~15-20% of full verification cost.
