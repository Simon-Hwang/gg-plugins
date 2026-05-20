---
description: Fix build, compile, lint, and type errors across Go, Python, PyTorch, and other stacks. Detects language automatically and delegates to the appropriate resolver agent.
---

# Build — Fix Build & Compilation Errors

Incrementally fix build and type errors with minimal, safe changes. Auto-detects the project language and delegates to the appropriate specialized agent:

- **Go**: `go-build-resolver` agent — fixes `go build`, `go vet`, `golangci-lint`
- **Python / generic**: `build-error-resolver` agent — fixes `mypy`, `ruff`, `pytest` import errors, pip issues
- **PyTorch / ML**: use `/gg:ml --fix` for CUDA, tensor shape, and training runtime errors

## Step 1: Detect Build System

Identify the project's build tool and run the build:

| Indicator | Build Command |
|-----------|---------------|
| `package.json` with `build` script | `npm run build` or `pnpm build` |
| `tsconfig.json` (TypeScript only) | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build 2>&1` |
| `pom.xml` | `mvn compile` |
| `build.gradle` | `./gradlew compileJava` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m compileall -q .` or `mypy .` |

## Step 2: Parse and Group Errors

1. Run the build command and capture stderr
2. Group errors by file path
3. Sort by dependency order (fix imports/types before logic errors)
4. Count total errors for progress tracking

## Step 3: Fix Loop (One Error at a Time)

For each error:

1. **Read the file** — Use Read tool to see error context (10 lines around the error)
2. **Diagnose** — Identify root cause (missing import, wrong type, syntax error)
3. **Fix minimally** — Use Edit tool for the smallest change that resolves the error
4. **Re-run build** — Verify the error is gone and no new errors introduced
5. **Move to next** — Continue with remaining errors

## Step 4: Guardrails

Stop and ask the user if:
- A fix introduces **more errors than it resolves**
- The **same error persists after 3 attempts** (likely a deeper issue)
- The fix requires **architectural changes** (not just a build fix)
- Build errors stem from **missing dependencies** (need `npm install`, `cargo add`, etc.)

## Step 5: Summary

Show results:
- Errors fixed (with file paths)
- Errors remaining (if any)
- New errors introduced (should be zero)
- Suggested next steps for unresolved issues

## Recovery Strategies

| Situation | Action |
|-----------|--------|
| Missing module/import | Check if package is installed; suggest install command |
| Type mismatch | Read both type definitions; fix the narrower type |
| Circular dependency | Identify cycle with import graph; suggest extraction |
| Version conflict | Check `package.json` / `Cargo.toml` for version constraints |
| Build tool misconfiguration | Read config file; compare with working defaults |

Fix one error at a time for safety. Prefer minimal diffs over refactoring.

## Agent Delegation

After running diagnostics, delegate to the appropriate resolver:

| Language detected | Agent invoked |
|-------------------|---------------|
| `go.mod` present | `go-build-resolver` (Go build, vet, golangci-lint) |
| `pyproject.toml` / `setup.py` | `build-error-resolver` (mypy, ruff, pytest imports) |
| Both present | Detect from failing command; use `build-error-resolver` for Python |
| PyTorch training crash | Use `/gg:ml --fix` instead |

## Related commands

- `/gg:ml --fix` — PyTorch/CUDA/training-specific error resolution
- `/gg:tdd` — write tests after build is green
- `/gg:diagnose --build` — when the root cause is unclear or runtime (not compile-time)
