---
name: task-trace
description: Capture and inspect task-level tool timelines, file activity, and best-effort skill/agent signals for GG sessions.
origin: gg
---

# Task Trace

Use this skill when you need to understand how a GG task actually progressed after or during a session: which tools ran, what files were touched, what failed, and which skills, agents, or `/gg:` commands were visible in the task surface.

This is an observability skill, not an execution workflow. It records local trace events through hooks and provides a deterministic inspect command for timeline and summary reports.

## Codex Compatibility

`task-trace` capture depends on GG hook events. In Codex, GG hook entrypoints no-op by default, so trace files may be empty or absent unless Codex hook experiments are explicitly enabled with `GG_ENABLE_CODEX_HOOKS=1`.

When operating in Codex:

- Do not manually invoke Claude Code hooks.
- Do not assume a timeline exists for the current task.
- Use the inspect commands only for trace files that already exist.
- Fall back to the conversation summary and shell history when no Codex trace file is present.

## What It Captures

`task-trace` writes local JSONL records with schema `gg.task-trace.v1`:

- user prompts from `UserPromptSubmit`
- completed tool calls from `PostToolUse`
- failed tool calls from `PostToolUseFailure`
- sanitized input and output summaries
- file paths and file events such as read, create, modify, delete, and move
- best-effort signals such as `command:/gg:plan`, `skill:task-trace`, or `agent:planner`

The trace file defaults to:

```text
~/.claude/metrics/gg-task-trace.jsonl
```

Override storage with:

```bash
GG_TASK_TRACE_DIR=/path/to/dir
GG_TASK_TRACE_FILE=/path/to/gg-task-trace.jsonl
```

Disable capture for a run with:

```bash
GG_TASK_TRACE=off
```

## Inspecting Traces

Use `/gg:task-trace` or run the deterministic inspect script directly:

```bash
node plugins/gg/scripts/task-trace-inspect.js summary --format markdown
node plugins/gg/scripts/task-trace-inspect.js timeline --session <session-id> --format markdown
node plugins/gg/scripts/task-trace-inspect.js timeline --task <task-id> --format json
```

## Interpretation Boundaries

Skill and agent attribution is best-effort. The hook can observe prompts and tool input, but it cannot see hidden model routing decisions. Treat `signals[]` as evidence that a skill, agent, or command was referenced or surfaced in a tool call, not as proof of internal model intent.

For deeper compliance measurement, pair trace evidence with `eval-harness` or an explicit grader. Do not run model-based grading inside the hook.

## Privacy And Safety

- Hook failures are non-blocking.
- Inputs and outputs are truncated.
- Common secrets such as GitHub tokens, AWS access keys, passwords, API keys, and Authorization headers are redacted before persistence.
- Raw code is not intentionally persisted beyond short sanitized summaries and file activity previews.

## Related GG Surfaces

- `enterprise-agent-ops`: long-lived agent observability and incident response.
- `eval-harness`: pass/fail criteria for expected behavior.
- `agent-introspection-debugging`: structured recovery when an agent loop fails or drifts.
- `continuous-learning-v2`: separate learning system that writes observations for instincts; `task-trace` intentionally uses an independent trace data file.
