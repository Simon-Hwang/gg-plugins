---
name: council
description: "Convene a four-voice council for ambiguous decisions, tradeoffs, and go/no-go calls. Use when multiple valid paths exist and you need structured disagreement before choosing — not for code review or implementation work."
origin: gg
credit: ECC
---

# Council

Convene four advisors for ambiguous decisions:
- the in-context Claude voice (Architect)
- a Skeptic subagent
- a Pragmatist subagent
- a Critic subagent

This is for **decision-making under ambiguity**, not code review, implementation planning, or architecture design.

## When to Use

Use council when:
- A decision has multiple credible paths and no obvious winner
- You need explicit tradeoff surfacing before committing to a direction
- The user asks for second opinions, dissent, or multiple perspectives
- Conversational anchoring is a real risk (long session with established direction)
- A go/no-go call would benefit from adversarial challenge

**Go/Python backend examples:**
- Monorepo vs polyrepo for a growing service
- ORM vs raw SQL for this use case
- gRPC vs REST for internal service communication
- Sync vs async Python for this workload profile
- Ship now vs hold for performance fix before launch
- Feature flag vs full rollout strategy
- Database per service vs shared schema for this bounded context

## When NOT to Use

| Instead of council | Use |
| --- | --- |
| Verifying whether output is correct | `santa-method` |
| Breaking a feature into implementation steps | `planner` agent |
| Designing system architecture | `architect` agent |
| Reviewing code for bugs or security | `code-reviewer` agent or `santa-method` |
| Straight factual questions | just answer directly |
| Obvious execution tasks | just do the task |

## Roles

| Voice | Lens |
| --- | --- |
| Architect | correctness, maintainability, long-term implications |
| Skeptic | premise challenge, simplification, assumption breaking |
| Pragmatist | shipping speed, user impact, operational reality |
| Critic | edge cases, downside risk, failure modes |

The three external voices are launched as fresh subagents with **only the question and relevant context**, not the full ongoing conversation. That is the anti-anchoring mechanism.

## Workflow

### 1. Extract the real question

Reduce the decision to one explicit prompt:
- What are we deciding?
- What constraints matter?
- What counts as success?

If the question is vague, ask one clarifying question before convening the council.

### 2. Gather only the necessary context

If the decision is codebase-specific:
- Collect the relevant files, snippets, metrics, or benchmark data
- Keep it compact — only what materially changes the answer
- Include current performance numbers, traffic patterns, or SLA targets if relevant

If the decision is strategic/general:
- Skip repo snippets unless they change the answer

### 3. Form the Architect position first

Before reading other voices, write down:
- Your initial position
- The three strongest reasons for it
- The main risk in your preferred path

Do this first so the synthesis does not simply mirror the external voices.

### 4. Launch three independent voices in parallel

Each subagent gets:
- The decision question
- Compact context if needed
- A strict role
- No unnecessary conversation history

Prompt shape:

```text
You are the [ROLE] on a four-voice decision council.

Question:
[decision question]

Context:
[only the relevant snippets or constraints]

Respond with:
1. Position — 1-2 sentences
2. Reasoning — 3 concise bullets
3. Risk — biggest risk in your recommendation
4. Surprise — one thing the other voices may miss

Be direct. No hedging. Keep it under 300 words.
```

Role emphasis:
- **Skeptic**: challenge framing, question assumptions, propose the simplest credible alternative
- **Pragmatist**: optimize for speed, simplicity, and real-world execution
- **Critic**: surface downside risk, edge cases, and reasons the plan could fail

### 5. Synthesize with bias guardrails

You are both a participant and the synthesizer:
- Do not dismiss an external view without explaining why
- If an external voice changed your recommendation, say so explicitly
- Always include the strongest dissent, even if you reject it
- If two voices align against your initial position, treat that as a real signal
- Keep the raw positions visible before the verdict

### 6. Present a compact verdict

```markdown
## Council: [short decision title]

**Architect:** [1-2 sentence position]
[1 line on why]

**Skeptic:** [1-2 sentence position]
[1 line on why]

**Pragmatist:** [1-2 sentence position]
[1 line on why]

**Critic:** [1-2 sentence position]
[1 line on why]

### Verdict
- **Consensus:** [where they align]
- **Strongest dissent:** [most important disagreement]
- **Premise check:** [did the Skeptic challenge the question itself?]
- **Recommendation:** [the synthesized path]
```

Keep it scannable on a phone screen.

## Persistence

Only persist a decision when it changes something real.

If the council materially changes the recommendation:
- Use `architecture-decision-records` skill to formalize the outcome as a long-lived ADR
- Or use `/gg:checkpoint` if the outcome belongs in session memory
- Or update the relevant GitHub issue directly if the decision changes active execution

Do NOT write ad-hoc notes to shadow paths from this skill.

## Multi-Round Follow-up

Default is one round.

If the user wants another round:
- Keep the new question focused
- Include the previous verdict only if necessary
- Keep the Skeptic as clean as possible to preserve anti-anchoring value

## Anti-Patterns

- Using council for code review (use `santa-method` or `code-reviewer`)
- Using council when the task is just implementation work
- Feeding subagents the entire conversation transcript
- Hiding disagreement in the final verdict
- Persisting every decision regardless of importance

## Related Skills

- `santa-method` — adversarial verification of output correctness
- `architecture-decision-records` — formalize the outcome when the decision becomes long-lived system policy
- `search-first` — gather external reference material before the council if needed
- `verification-loop` — deterministic quality gates (build/lint/test) after the decision is implemented
