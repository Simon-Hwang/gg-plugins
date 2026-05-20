---
description: Codebase exploration and onboarding — map architecture, trace execution paths, scan assets, look up library docs, and produce a concise orientation report.
argument-hint: "[entry point | feature to explore | library to look up | --scan | --onboard]"
---

# Explore — Codebase Exploration & Onboarding

Maps unfamiliar code: architecture layers, entry points, execution traces, third-party dependencies, and conventions. Produces an orientation report you can reference throughout development.

**Input**: $ARGUMENTS

---

## Step 1 — Surface Audit

Apply `workspace-surface-audit` skill to understand what's available in the current environment:

```bash
ls -la                            # project root
cat README.md 2>/dev/null | head -80
ls go.mod pyproject.toml Makefile Taskfile.yml 2>/dev/null
find . -name "*.go" -o -name "*.py" | head -20 | sort
```

Identify:
- Language(s) and build tools
- Project structure (monorepo, single service, library)
- Available MCP servers and plugins
- Test framework and commands

---

## Step 2 — Codebase Onboarding

Apply `codebase-onboarding` skill to build an orientation map:

Scan for entry points:
```bash
# Go: find main packages and HTTP handlers
rg -n "func main\(\)" --type go
rg -n "http\.Handle\|router\.\|mux\." --type go -l

# Python: find app factory, CLI entry, ASGI app
rg -n "def create_app\|FastAPI\(\|Flask\(\|@app\." --type py -l
rg -n "__main__" --type py
```

Document:
- **Entry points**: where requests enter the system
- **Layer structure**: handler → service → repository (or equivalent)
- **Key domain types**: most important structs/models/schemas
- **Shared utilities**: logging, config, auth middleware
- **Test commands**: how to run tests and check coverage
- **Safe first change**: which area has the most test coverage and clearest patterns

---

## Step 3 — Deep Feature Exploration (if specific topic given)

If `$ARGUMENTS` names a specific feature, flow, or file:

Invoke `code-explorer` agent to:
- Trace the complete execution path for that feature
- Map all files involved (handler → middleware → service → repository → DB)
- Identify all callers and dependencies
- Surface data transformations and validation points
- Document edge cases and error paths

Apply `iterative-retrieval` to gather context progressively:
1. Read the entry point
2. Follow each function call one level deeper
3. Map dependencies before going further
4. Stop when you have enough context to describe the full flow

---

## Step 4 — Asset Scan (if --scan)

Apply `repo-scan` skill for a full asset audit:
- Classify every file by type (source, test, config, generated, vendor)
- Detect embedded third-party libraries
- Produce four-level verdicts (keep / review / migrate / remove) per module
- Generate an HTML report in `.scan/report.html`

Useful for: licensing audits, dependency cleanup, understanding what's in a new repo.

---

## Step 5 — Library Documentation Lookup

If `$ARGUMENTS` references a library name, or if exploration surfaces unfamiliar packages:

Invoke `docs-lookup` agent with Context7 MCP to fetch current documentation:
```
docs-lookup: resolve docs for <library-name>
```

Apply `documentation-lookup` skill for Go/Python external dependencies:
- Setup and installation instructions
- API usage examples
- Version-specific behavior and migration guides
- Known issues and workarounds

---

## Step 6 — Orientation Report

```
Codebase Orientation Report
─────────────────────────────────────────
Project:    <name>
Language:   Go | Python | Mixed
Stack:      <framework, DB, queue, ...>
─────────────────────────────────────────
Entry Points:
  <file:line> — <description>

Layer Structure:
  <handler layer>  →  <path>
  <service layer>  →  <path>
  <repository>     →  <path>

Key Domain Types:
  <type name>  (<file>) — <one-line description>

Test Commands:
  <how to run tests>
  <how to check coverage>

Safe First Change: <area with good test coverage>

Third-Party Libraries: N found
  [scan results if --scan was used]

Docs Fetched: <library names>
─────────────────────────────────────────
Next: /gg:feature to start building
      /gg:tdd to add tests for an untested area
      /gg:design if architecture decisions are needed
```

---

## Skills activated

- `workspace-surface-audit` — environment and tool inventory
- `codebase-onboarding` — architecture map, entry points, test commands
- `iterative-retrieval` — progressive context gathering for deep exploration
- `documentation-lookup` — external library API lookup
- `repo-scan` — full asset classification and audit (--scan)

## Agents invoked

- `code-explorer` — deep feature/flow tracing (when specific topic given)
- `docs-lookup` — library documentation via Context7 (when library names found)
- `architect` — architecture layer analysis (for complex systems)

## Related commands

- `/gg:feature` — use after onboarding to plan a new feature
- `/gg:design` — deep architecture design session
- `/gg:build-rag` — build a persistent RAG knowledge base for the repo
- `/gg:gg-guide` — navigate GG's own skills, agents, and commands
