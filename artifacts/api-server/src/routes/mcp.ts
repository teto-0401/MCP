import { Router, type IRouter, type Request, type Response } from "express";
import { mcpToolRegistry } from "../lib/mcpTools";
import { incrementToolCall } from "../lib/serverMetrics";
import { db, auditLogsTable } from "@workspace/db";
import { CallMcpToolBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the externally reachable base URL of this server. */
function getPublicBaseUrl(req: Request): string {
  // REPLIT_DOMAINS is set in both dev and deployed Replit environments
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;

  // Fallback: reconstruct from forwarded headers
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

// JSON-RPC helpers
const jsonRpcOk = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const jsonRpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// SSE session registry: sessionId -> Response
const sseSessions = new Map<string, Response>();

// ─── MCP Tool dispatcher (shared by all transports) ───────────────────────────

async function handleJsonRpc(msg: {
  jsonrpc?: string;
  id?: unknown;
  method: string;
  params?: unknown;
}): Promise<unknown> {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize":
      return jsonRpcOk(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "replit-mcp-server", version: "1.0.0" },
      });

    case "notifications/initialized":
    case "ping":
      return jsonRpcOk(id, {});

    case "tools/list": {
      const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return jsonRpcOk(id, { tools });
    }

    case "tools/call": {
      const { name, arguments: args = {} } = (msg.params ?? {}) as {
        name: string;
        arguments?: Record<string, unknown>;
      };

      const tool = mcpToolRegistry.get(name);
      if (!tool) return jsonRpcErr(id, -32601, `Tool '${name}' not found`);

      const start = Date.now();
      try {
        const result = await dispatchTool(name, args);
        const duration = Date.now() - start;
        incrementToolCall(name, duration, false);

        await db.insert(auditLogsTable).values({
          level: "info",
          tool: name,
          message: `MCP tool call: ${name}`,
          metadata: { args },
          duration: duration / 1000,
        }).catch(() => {});

        return jsonRpcOk(id, {
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (err: unknown) {
        const duration = Date.now() - start;
        incrementToolCall(name, duration, true);
        const errMsg = err instanceof Error ? err.message : "Tool error";

        await db.insert(auditLogsTable).values({
          level: "error",
          tool: name,
          message: `MCP tool error: ${name} — ${errMsg}`,
          metadata: { args },
          duration: duration / 1000,
        }).catch(() => {});

        return jsonRpcOk(id, {
          content: [{ type: "text", text: `Error: ${errMsg}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonRpcErr(id, -32601, `Method not found: ${msg.method}`);
  }
}

// ─── Transport 1: Streamable HTTP (MCP spec 2025-03-26, supported by Grok) ────
// Single POST endpoint — no SSE handshake needed. Most modern MCP clients use this.

router.post("/mcp", async (req: Request, res: Response): Promise<void> => {
  const msg = req.body as { jsonrpc?: string; id?: unknown; method: string; params?: unknown };

  if (!msg || typeof msg.method !== "string") {
    res.status(400).json(jsonRpcErr(null, -32600, "Invalid Request"));
    return;
  }

  try {
    const result = await handleJsonRpc(msg);

    // If client accepts SSE, respond as SSE stream (for long-running calls)
    const acceptsSse = req.headers.accept?.includes("text/event-stream");
    if (acceptsSse) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    } else {
      res.json(result);
    }
  } catch {
    res.status(500).json(jsonRpcErr(null, -32603, "Internal error"));
  }
});

// ─── Transport 2: SSE Transport (legacy MCP clients, Claude Desktop) ──────────
// GET /api/mcp/sse  → opens SSE stream, sends 'endpoint' event with POST URL
// POST /api/mcp/messages?sessionId=xxx  → receives JSON-RPC, responds over SSE

router.get("/mcp/sse", (req: Request, res: Response): void => {
  const sessionId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Force chunked encoding so nginx/caddy don't buffer
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  sseSessions.set(sessionId, res);

  // Derive the externally reachable URL for the messages endpoint
  const baseUrl = getPublicBaseUrl(req);
  const messagesUrl = `${baseUrl}/api/mcp/messages?sessionId=${sessionId}`;
  res.write(`event: endpoint\ndata: ${messagesUrl}\n\n`);

  // Keepalive comment every 20 s to prevent proxy timeouts
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(keepalive);
    sseSessions.delete(sessionId);
  });
});

router.post("/mcp/messages", async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.query as { sessionId?: string };
  const sseRes = sessionId ? sseSessions.get(sessionId) : undefined;

  const msg = req.body as { jsonrpc?: string; id?: unknown; method: string; params?: unknown };

  if (!msg || typeof msg.method !== "string") {
    res.status(400).end();
    return;
  }

  try {
    // Notifications don't get a response
    if (msg.method === "notifications/initialized") {
      res.status(202).end();
      return;
    }

    const result = await handleJsonRpc(msg);
    const data = JSON.stringify(result);

    // Push response over the SSE stream
    if (sseRes && !sseRes.writableEnded) {
      sseRes.write(`event: message\ndata: ${data}\n\n`);
    }

    // Also send on the POST response so stateless clients work too
    res.status(200).json(result);
  } catch {
    res.status(500).end();
  }
});

// ─── REST endpoints (used by the dashboard UI) ────────────────────────────────

router.get("/mcp/tools", async (_req, res): Promise<void> => {
  const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    category: (t as { category?: string }).category,
    inputSchema: t.inputSchema,
    callCount: (t as { callCount?: number }).callCount ?? 0,
    averageMs: (() => {
      const tt = t as { callCount?: number; totalMs?: number };
      return tt.callCount ? (tt.totalMs ?? 0) / tt.callCount : 0;
    })(),
    errorRate: (() => {
      const tt = t as { callCount?: number; errorCount?: number };
      return tt.callCount ? (tt.errorCount ?? 0) / tt.callCount : 0;
    })(),
  }));
  res.json(tools);
});

router.get("/mcp/manifest", async (_req, res): Promise<void> => {
  const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  res.json({ name: "replit-mcp-server", version: "1.0.0", tools });
});

router.post("/mcp/call", async (req, res): Promise<void> => {
  const parsed = CallMcpToolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, arguments: args } = parsed.data;

  const tool = mcpToolRegistry.get(name);
  if (!tool) {
    res.status(404).json({ error: `Tool '${name}' not found` });
    return;
  }

  const start = Date.now();
  try {
    const result = await dispatchTool(name, args);
    const duration = Date.now() - start;
    incrementToolCall(name, duration, false);

    await db.insert(auditLogsTable).values({
      level: "info",
      tool: name,
      message: `MCP tool call: ${name}`,
      metadata: { args },
      duration: duration / 1000,
    }).catch(() => {});

    res.json({
      content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
      isError: false,
    });
  } catch (err: unknown) {
    const duration = Date.now() - start;
    incrementToolCall(name, duration, true);
    const msg = err instanceof Error ? err.message : "Tool call failed";

    await db.insert(auditLogsTable).values({
      level: "error",
      tool: name,
      message: `MCP tool error: ${name} — ${msg}`,
      metadata: { args },
      duration: duration / 1000,
    }).catch(() => {});

    res.json({
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    });
  }
});

// ─── Tool dispatcher ───────────────────────────────────────────────────────────

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const baseUrl = `http://localhost:${process.env.PORT}/api`;

  switch (name) {
    case "read_file": {
      const r = await fetch(`${baseUrl}/files/read?path=${encodeURIComponent(String(args.path))}`);
      return r.json();
    }
    case "write_file": {
      const r = await fetch(`${baseUrl}/files/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "delete_file": {
      const r = await fetch(`${baseUrl}/files/delete?path=${encodeURIComponent(String(args.path))}&recursive=${args.recursive ?? false}`, { method: "DELETE" });
      return r.json();
    }
    case "list_files": {
      const params = new URLSearchParams({ path: String(args.path ?? "."), recursive: String(args.recursive ?? false) });
      const r = await fetch(`${baseUrl}/files?${params}`);
      return r.json();
    }
    case "search_files": {
      const params = new URLSearchParams({ query: String(args.query), path: String(args.path ?? ".") });
      const r = await fetch(`${baseUrl}/files/search?${params}`);
      return r.json();
    }
    case "move_file": {
      const r = await fetch(`${baseUrl}/files/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "execute_node":
      return executeCode("node", args, baseUrl);
    case "execute_python":
      return executeCode("python", args, baseUrl);
    case "execute_bash":
      return executeCode("bash", args, baseUrl);
    case "run_terminal": {
      const r = await fetch(`${baseUrl}/terminal/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "git_status": {
      const r = await fetch(`${baseUrl}/git/status`);
      return r.json();
    }
    case "git_commit": {
      const r = await fetch(`${baseUrl}/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "git_diff": {
      const r = await fetch(`${baseUrl}/git/diff`);
      return r.json();
    }
    case "git_log": {
      const r = await fetch(`${baseUrl}/git/log`);
      return r.json();
    }
    case "install_package": {
      const r = await fetch(`${baseUrl}/packages/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "list_packages": {
      const r = await fetch(`${baseUrl}/packages/installed`);
      return r.json();
    }
    case "get_env": {
      const r = await fetch(`${baseUrl}/env`);
      return r.json();
    }
    case "set_env": {
      const r = await fetch(`${baseUrl}/env/${encodeURIComponent(String(args.key))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: args.value, redacted: args.redacted }),
      });
      return r.json();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function executeCode(language: string, args: Record<string, unknown>, baseUrl: string): Promise<unknown> {
  const r = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code: args.code, timeout: args.timeout, workDir: args.workDir, env: args.env }),
  });
  return r.json();
}

export default router;
