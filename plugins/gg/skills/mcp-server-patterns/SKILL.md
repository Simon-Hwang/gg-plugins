---
name: mcp-server-patterns
description: Use when building or maintaining MCP servers for Go or Python services, including tools, resources, prompts, input schemas, stdio transport, Streamable HTTP, and operational safety.
origin: gg
---

# MCP Server Patterns

The Model Context Protocol (MCP) lets AI assistants call tools, read resources, and use prompt templates from a server. In GG, prefer Go or Python implementations and verify current SDK APIs with official docs or Context7 before copying signatures.

## When to Use

- Creating a new MCP server for a Go or Python backend.
- Adding a tool, resource, or prompt to an existing MCP server.
- Choosing between local stdio and remote Streamable HTTP transport.
- Debugging registration, schema validation, authentication, or timeout issues.

## Core Concepts

- **Tools** perform actions. Keep them narrow, documented, and idempotent where possible.
- **Resources** return read-only data by URI. They should not mutate state.
- **Prompts** provide reusable templates with explicit arguments.
- **Transports** connect the server to clients. Use stdio for local clients and Streamable HTTP for remote clients.
- **Schemas** define input contracts. Validate every tool input before touching external systems.

## Go/Python Implementation Shape

Keep business logic independent from MCP transport:

```text
app/
  service/        # real domain logic
  adapters/mcp/   # MCP tool/resource wrappers
  cmd/mcp/        # stdio or HTTP entrypoint
```

For Python, prefer the project's existing stack and validation patterns. For Go, keep tool handlers small and pass dependencies through explicit constructors.

## Tool Design Checklist

- Name describes the action, not the implementation.
- Description tells the model when to use it and what inputs are required.
- Input schema rejects missing, ambiguous, or unsafe parameters.
- Output is structured and concise.
- Errors are safe for the model to interpret; do not return raw stack traces or secrets.
- External calls have timeouts and bounded retries.
- Mutating tools explain side effects and require clear intent.

## Transport Guidance

- Use **stdio** for local development and desktop/client-local usage.
- Use **Streamable HTTP** for remote clients, shared services, or cloud deployment.
- Put auth, rate limits, and audit logging at the HTTP boundary.
- Do not let transport handlers contain domain logic.

## Verification

Before shipping:

```bash
# Python
pytest
ruff check .

# Go
go test ./...
go vet ./...
```

Also run a manual MCP client smoke test: list tools/resources, call one success case, call one validation failure, and confirm logs are safe.
