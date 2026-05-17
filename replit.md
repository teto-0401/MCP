# MCP Server for Coding Workflows

A production-ready Model Context Protocol (MCP) server for coding workflows on Replit, with a full-featured React monitoring dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/mcp-dashboard run dev` — run the monitoring dashboard (port 18845)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Dashboard: React + Vite + shadcn/ui + Recharts + Wouter

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth OpenAPI spec (all endpoints)
- `lib/db/src/schema/` — Drizzle DB schema files (apiKeys, auditLogs, envVars)
- `lib/api-client-react/` — generated React Query hooks (from codegen)
- `lib/api-zod/` — generated Zod schemas (from codegen)
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/api-server/src/lib/mcpTools.ts` — MCP tool registry (18 tools)
- `artifacts/api-server/src/lib/serverMetrics.ts` — in-memory metrics store
- `artifacts/api-server/src/middlewares/rateLimiter.ts` — rate limiting (200 req/min per IP)
- `artifacts/mcp-dashboard/src/pages/` — all dashboard pages

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives everything — Zod validators on the server, React Query hooks on the client, all generated automatically.
- **MCP tools via HTTP self-calls**: The `/api/mcp/call` endpoint dispatches tool calls by making internal HTTP requests to the same server (e.g. `/api/files/read`). This keeps tool logic DRY while conforming to MCP protocol.
- **In-memory metrics**: Server stats (request count, CPU, memory, active sessions, rate limit windows) are tracked in-process via `serverMetrics.ts` singletons for zero-latency reads. Not persisted across restarts.
- **Audit log + API keys in Postgres**: Durable storage for security-sensitive data (API key hashes, audit trail) while keeping operational metrics in-memory.
- **Safety controls in execute/terminal**: Blocklist of dangerous patterns (`rm -rf /`, `shutdown`, fork bombs, etc.) enforced before any command runs.

## Product

- **MCP endpoint** (`/api/mcp`): Serve tool manifests and handle tool calls per the MCP protocol. Supports 18 tools across 6 categories: files, execution, terminal, git, packages, environment.
- **File management**: List, read, write, delete files, search file contents — sandboxed to `WORK_DIR`.
- **Code execution**: Run Node.js, Python, or Bash in a sandboxed subprocess with configurable timeout.
- **Terminal sessions**: Create named terminal sessions, execute commands, stream output.
- **Git integration**: Status, log, branches, commit, diff — powered by `simple-git`.
- **Package management**: Install/uninstall npm/pnpm/yarn/pip packages, list installed packages.
- **Environment variables**: CRUD for project env vars stored in Postgres with optional value redaction.
- **API key auth**: Create/revoke API keys with granular permissions, tracked in Postgres.
- **Audit logging**: Every request recorded to Postgres audit log with tool, level, duration, message.
- **Monitoring dashboard**: Live React dashboard with server metrics, tool usage charts, active connections, audit log viewer, and interactive tool tester.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` after any changes to `lib/db` schema — the compiled declarations need to be up to date before leaf packages can typecheck against them.
- Run `pnpm --filter @workspace/api-spec run codegen` after any changes to `lib/api-spec/openapi.yaml`.
- `WORK_DIR` env var controls the file operation sandbox root (defaults to `process.cwd()`).
- MCP tool dispatch makes internal self-calls — the server must be fully started before MCP tool calls can work end-to-end.
- Do not use `pnpm run dev` at workspace root — use `restart_workflow` or run per-artifact.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `Dockerfile` and `docker-compose.yml` in `artifacts/api-server/` for containerized deployment
- `README.md` in `artifacts/api-server/` for MCP client configuration examples
