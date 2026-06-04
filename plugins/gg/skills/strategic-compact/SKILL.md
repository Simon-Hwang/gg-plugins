---
name: strategic-compact
description: Guides manual Claude Code context compaction at logical task boundaries. Use when sessions are long, context pressure is high, /compact is mentioned, or GG's suggest-compact hook recommends a checkpoint.
origin: ECC
---

# Strategic Compact

Use Claude Code's built-in `/compact` command at logical task boundaries instead of waiting for arbitrary automatic compaction.

## Codex Compatibility

This skill is Claude Code-only. Codex has its own compaction lifecycle, and GG must not invoke Claude Code's `/compact` command or force a Codex remote compact task.

When this skill is mentioned in Codex:

- Do not run `/compact`.
- Do not trigger a remote compact operation.
- Write a concise handoff summary in the conversation instead, then suggest starting a new Codex thread when the current context is too large.
- If Codex auto-compaction fails, treat it as a Codex transport/runtime issue rather than a GG skill execution step.

## When To Use

Consider compacting when:

- A long session is approaching context pressure or responses are becoming less coherent.
- A multi-phase task is moving from research to planning, planning to implementation, or debugging to new work.
- A major milestone is complete and the next phase can start from a concise summary.
- The `suggest-compact` hook emits a `[StrategicCompact]` reminder.

Avoid compacting in the middle of a tightly coupled implementation or debugging step where recent file paths, symbols, and partial reasoning are still needed.

## GG Hook Relationship

GG provides two compact-related hooks:

- `pre:edit-write:suggest-compact` runs before `Edit` and `Write`, counts tool calls per session, and prints a reminder at `GG_COMPACT_THRESHOLD` calls. The default threshold is `50`; after that it reminds every `25` calls.
- `pre:compact` runs before an actual context compaction and records that compaction happened. It does not trigger compaction by itself.

Important: `suggest-compact` only reminds. It never runs `/compact` automatically. `/compact` is a Claude Code built-in slash command that the user or agent must invoke manually.

## Decision Guide

Use this default policy:

- Research -> planning: compact if the research result has been distilled into a plan or notes.
- Planning -> implementation: compact if the plan is saved in `TodoWrite` or a file and no raw exploration context is needed.
- Implementation -> testing: usually keep context unless the implementation is complete and testing is a separate phase.
- Debugging -> next feature: compact to clear stale traces and failed hypotheses.
- Mid-implementation: do not compact unless blocked by context pressure.
- After a failed approach: compact after saving the useful lesson, then restart with a clean context.

## Before Compacting

Preserve anything the next phase needs:

- Write the current plan into `TodoWrite` or a project file.
- Note important file paths, symbols, commands, and constraints.
- Summarize unresolved questions and the next concrete action.
- Make sure any code changes are on disk.

Suggested format:

```text
/compact We finished <phase>. Continue with <next action>. Key files: <paths>. Constraints: <constraints>.
```

## What Survives

Usually survives:

- Files on disk
- Git state
- Project rules and installed skills
- Todo state that the host preserves

Usually does not survive in full detail:

- Intermediate reasoning
- Large tool outputs
- Previously read file contents
- Nuanced preferences only mentioned in conversation

Treat `/compact` as a phase transition, not a cleanup button.
