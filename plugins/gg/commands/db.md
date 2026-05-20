---
description: Database work — schema design, migration authoring, query optimization, and data-layer review across PostgreSQL, MySQL, and Redis. Delegates to database-reviewer agent.
argument-hint: "[schema change | migration task | query to optimize | --postgres | --mysql | --redis]"
---

# DB — Database Work

Covers the full database workflow: design → migrate → review → optimize. Delegates to `database-reviewer` and applies the relevant DB pattern skills.

**Input**: $ARGUMENTS

---

## Step 1 — Detect Database and Task Type

```bash
# Detect DB type from project config
rg -l "postgres|postgresql|pgx|psycopg" --type go --type py --type toml --type yaml
rg -l "mysql|mariadb|go-sql-driver" --type go --type py --type toml --type yaml
rg -l "redis|go-redis|aioredis" --type go --type py --type toml --type yaml
```

Or use `--postgres`, `--mysql`, `--redis` flags to override detection.

Identify the task type from `$ARGUMENTS`:
- **Schema design** → "design a table/model for X"
- **Migration** → "add column / rename / backfill / drop"
- **Query optimization** → "slow query / N+1 / missing index"
- **Review** → "review this migration / schema change"

---

## Step 2 — Schema Design (if applicable)

Apply the appropriate pattern skill:

### PostgreSQL (`postgres-patterns`)
- Use `BIGSERIAL` or `UUID` PKs; prefer `UUID v7` for sortable IDs
- Use `NOT NULL` with defaults; avoid nullable columns where possible
- Normalize to 3NF; denormalize intentionally with a comment
- Add `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at` with trigger
- Use partial indexes for filtered queries
- Add `CHECK` constraints at the DB level for domain invariants
- Enable Row-Level Security for multi-tenant data

### MySQL/MariaDB (`mysql-patterns`)
- Use `BIGINT UNSIGNED AUTO_INCREMENT` or `CHAR(36)` UUIDs
- Use `InnoDB` engine; `utf8mb4` charset
- Avoid nullable columns on indexed fields
- Keep transactions short; use `READ COMMITTED` isolation
- Separate read replicas for reporting queries

### Redis (`redis-patterns`)
- Choose data structure by access pattern: String, Hash, List, Set, Sorted Set, Stream
- Set TTLs on all cache keys; document expiry policy
- Use `SCAN` not `KEYS` in production
- Implement distributed locks with `SET NX PX` + Lua scripts
- Use pub/sub for fan-out; Streams for durable queues

---

## Step 3 — Migration Authoring

Apply `database-migrations` skill:

### Migration Safety Rules
1. **Add, don't remove** — add columns/tables before removing old references
2. **Never rename** live columns — add new + dual-write + backfill + switch + drop old
3. **Index before constraint** — add index concurrently, then add foreign key
4. **Backfill separately** — never `UPDATE` millions of rows in a migration
5. **Always have a rollback** — every `up` migration has a `down`
6. **Zero-downtime checklist**:
   - Adding a nullable column: safe
   - Adding a `NOT NULL` column: needs default or two-step
   - Dropping a column: requires deploy without the column first
   - Renaming: never safe in a single deploy

### Migration template
```sql
-- Migration: NNN_description
-- Created: YYYY-MM-DD
-- Rollback: see down migration

-- Up
BEGIN;
-- ... changes here
COMMIT;

-- Down
BEGIN;
-- ... rollback here
COMMIT;
```

---

## Step 4 — Delegate to `database-reviewer` Agent

Invoke the `database-reviewer` agent to review:
- Schema correctness and normalization
- Index coverage for query patterns
- Missing constraints and FK integrity
- Query performance (N+1, sequential scans, missing indexes)
- Security (RLS policies, injection surface, privilege separation)
- Migration safety (blocking operations, lock acquisition, rollback completeness)

The agent runs EXPLAIN ANALYZE if a live connection is available.

---

## Step 5 — Query Optimization (if applicable)

If `$ARGUMENTS` contains a slow query or mentions performance:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) <query>;
```

Optimization checklist:
- [ ] Is the query using an index? (check `Seq Scan` vs `Index Scan`)
- [ ] Are statistics current? (`ANALYZE <table>`)
- [ ] N+1 pattern? (loop + individual fetches → batch with `WHERE IN` or JOIN)
- [ ] Missing composite index for multi-column `WHERE` clause?
- [ ] Unnecessary `SELECT *` pulling large columns?
- [ ] `LIMIT` before expensive `ORDER BY`?

---

## Step 6 — Summary

```
DB Work Complete
─────────────────────────────────────────
Database:   PostgreSQL | MySQL | Redis
Task:       schema design | migration | optimization | review
─────────────────────────────────────────
Schema changes:   N tables | N columns | N indexes
Migration:        PASS safe | WARN review needed | FAIL blocking issue
Query review:     PASS | N issues found
Security:         N findings
─────────────────────────────────────────
Next: /gg:tdd to write DB layer tests
      /gg:review to audit service-layer code that uses this schema
```

---

## Skills activated

- `database-migrations` — migration safety rules and zero-downtime patterns
- `postgres-patterns` — PostgreSQL schema, index, and security patterns
- `mysql-patterns` — MySQL/MariaDB production patterns
- `redis-patterns` — Redis data structures, caching, locking, pub/sub

## Agent invoked

- `database-reviewer` — comprehensive DB review (schema, queries, security, performance)

## Related commands

- `/gg:design` — design the service layer above the database
- `/gg:tdd` — write repository-layer tests after schema is confirmed
- `/gg:review` — review Go/Python code that queries the database
