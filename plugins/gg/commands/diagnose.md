---
description: Performance and error diagnosis — profile slow paths, detect silent failures, resolve build/runtime errors, and produce a root-cause report with fixes.
argument-hint: "[symptom description | --perf | --errors | --build | --agent]"
---

# Diagnose — Performance & Error Diagnosis

Investigates production-level symptoms: slow endpoints, memory growth, goroutine leaks, silent failures, and build/runtime crashes. Delegates to `performance-optimizer`, `silent-failure-hunter`, and build resolver agents.

**Input**: $ARGUMENTS

---

## Step 1 — Triage Symptom

Classify the issue from `$ARGUMENTS`:

| Flag | Symptom | Primary Agent |
|------|---------|---------------|
| `--perf` | Slow handler, high latency, memory growth, goroutine leak | `performance-optimizer` |
| `--errors` | Silent failures, swallowed exceptions, wrong fallbacks | `silent-failure-hunter` |
| `--build` | Build/compile/import errors, runtime panics, type errors | `build-error-resolver` or `go-build-resolver` |
| `--agent` | AI agent loop stalling, unexpected outputs, tool call failures | `agent-introspection-debugging` skill |
| (none) | Run all tracks — triage first, then specialize |

Collect initial evidence before diving deeper:

```bash
# Build check
go build ./... 2>&1 | head -50          # Go
python -m py_compile src/**/*.py 2>&1   # Python

# Recent logs
git log --oneline -10                   # What changed recently?
git diff HEAD~3..HEAD --stat            # File-level change scope
```

---

## Step 2 — Performance Investigation (if --perf)

Invoke `performance-optimizer` agent.

Apply `terminal-ops` skill to gather runtime evidence with real commands:

**Go profiling:**
```bash
# CPU profile (needs pprof endpoint or test)
go test -cpuprofile=cpu.prof -bench=BenchmarkFoo ./...
go tool pprof cpu.prof

# Memory profile
go test -memprofile=mem.prof ./...
go tool pprof mem.prof

# Goroutine leak check
curl http://localhost:6060/debug/pprof/goroutine?debug=1

# Trace
go test -trace=trace.out ./... && go tool trace trace.out
```

**Python profiling:**
```bash
python -m cProfile -s cumulative -o profile.out script.py
python -m pstats profile.out

# Memory
pip install memory-profiler
python -m memory_profiler script.py

# Line profiling
pip install line-profiler
kernprof -l -v script.py
```

**Common patterns to check:**
- N+1 database queries (log slow queries: `log_min_duration_statement = 100`)
- Missing DB indexes (check `EXPLAIN ANALYZE`)
- Unbuffered channels causing goroutine pile-up
- Memory retained by closures or global caches
- Large JSON/protobuf marshaling in hot paths
- Inefficient string building in loops (Go: `strings.Builder`; Python: `"".join()`)

---

## Step 3 — Error Tracing (if --errors)

Invoke `silent-failure-hunter` agent.

Apply `error-handling` skill to trace error propagation:

**Evidence gathering:**
```bash
# Find all error-swallowing patterns
rg -n "_ = err|_ = " --type go                  # Go: ignored errors
rg -n "except:\s*$|except Exception:\s*pass" --type py  # Python: bare except

# Find all log.Error / logger.Error without return
rg -n -A2 "log\.Error|logger\.error" --type go --type py

# Find functions that return (T, error) but callers ignore error
rg -n "= \w+\(" --type go | grep -v "err"
```

Trace from the symptom backward to the root cause:
1. What was the user-visible failure?
2. What function returned the bad value?
3. Where was the error first swallowed?
4. What should have happened?

---

## Step 4 — Build/Runtime Error Resolution (if --build)

Detect language and delegate to the appropriate resolver:

- **Go build/vet failures** → `go-build-resolver` agent
- **Python/generic build failures** → `build-error-resolver` agent
- **PyTorch/CUDA/ML errors** → use `/gg:ml` command instead

The agent fixes incrementally: one error at a time, re-verifying after each fix.

---

## Step 5 — Agent Introspection (if --agent)

Apply `agent-introspection-debugging` skill for AI agent failures:

Capture the failure:
1. Reproduce the stalling or wrong-output condition
2. Identify the last tool call before the failure
3. Check context window pressure (`context-budget` skill if relevant)
4. Apply structured recovery: reset to last known good state, inject corrected context, re-run

---

## Step 6 — Root-Cause Report

```
Diagnosis Report
─────────────────────────────────────────
Symptom:    <from $ARGUMENTS>
Track:      performance | errors | build | agent
─────────────────────────────────────────
Root Cause: <1-2 sentence description>

Evidence:
  <tool output or log excerpt that proves the cause>

Fix Applied:
  <what was changed and why>

Verification:
  <command run and result that confirms fix>

Residual Risk:
  <anything that needs monitoring or follow-up>
─────────────────────────────────────────
Next: /gg:tdd to add a regression test for this issue
      /gg:review to confirm the fix doesn't introduce new issues
```

---

## Skills activated

- `error-handling` — error propagation patterns and tracing
- `agent-introspection-debugging` — AI agent failure recovery
- `terminal-ops` — running diagnostic commands with actual evidence
- `context-budget` — assess context pressure if agent issues are suspected

## Agents invoked

- `performance-optimizer` — profiling and latency optimization (--perf)
- `silent-failure-hunter` — error tracing and swallowed exception detection (--errors)
- `go-build-resolver` — Go build/vet/lint error fixing (--build + Go)
- `build-error-resolver` — generic multi-lang build fixing (--build)

## Related commands

- `/gg:build-fix` — focused build-error-only fixing loop
- `/gg:tdd` — add regression tests after diagnosing a bug
- `/gg:refactor` — clean up error handling after investigation
- `/gg:agent-health` — if symptoms suggest the agent harness itself is misconfigured
