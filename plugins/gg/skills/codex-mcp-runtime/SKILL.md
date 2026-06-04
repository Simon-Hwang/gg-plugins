---
name: codex-mcp-runtime
description: Use when GG documentation lookup, docs-lookup, Context7, MCP setup, or live third-party documentation lookup is needed in Codex.
origin: GG Codex adapter
---

# Codex MCP Runtime

GG includes a Codex-compatible MCP manifest at `../../.mcp.json`. It exposes the same Context7 template as `../../mcp-configs/mcp-servers.json` so Codex can install or run live public documentation lookup when the plugin is enabled.

## Context7

Use Context7 for current public library documentation when:

- a task depends on version-sensitive framework or library behavior
- a GG command or agent asks for `docs-lookup`
- local code references unfamiliar third-party APIs
- the user explicitly asks for live/current docs

If the MCP server is unavailable, continue with local source inspection and say that live docs lookup was unavailable.

## Boundaries

Do not auto-enable unrelated MCP servers. Keep Context7 opt-in through the plugin manifest and the user's Codex plugin/MCP configuration.
