import { Router, type IRouter, type Request, type Response } from "express";
import { mcpToolRegistry } from "../lib/mcpTools";
import { incrementToolCall } from "../lib/serverMetrics";
import { db, auditLogsTable } from "@workspace/db";
import { CallMcpToolBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// In-memory SSE session map: sessionId -> Response
const sseSessions = new Map<string, Response>();

// ─── SSE Transport (for Grok / Claude Desktop / MCP clients) ─────────────────

router.get("/mcp/sse", (req: Request, res: Response): void => {
  const sessionId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sseSessions.set(sessionId, res);

  // Tell the client where to POST messages
  const baseUrl = (req.headers["x-forwarded-proto"] ?? req.protocol) + "://" +
    (req.headers["x-forwarded-host"] ?? req.headers.host);
  const messagesUrl = `${baseUrl}/api/mcp/messages?sessionId=${sessionId}`;
  res.write(`event: endpoint\ndata: ${messagesUrl}\n\n`);

  // Keepalive ping every 25 s
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepalive);
    sseSessions.delete(sessionId);
  });
});

router.post("/mcp/messages", async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.query as { sessionId?: string };
  const sseRes = sessionId ? sseSessions.get(sessionId) : undefined;

  const msg = req.body as { jsonrpc: string; id: unknown; method: string; params?: unknown };

  // Helper: send response back over SSE
  function sendSse(payload: unknown) {
    const data = JSON.stringify(payload);
    if (sseRes && !sseRes.writableEnded) {
      sseRes.write(`event: message\ndata: ${data}\n\n`);
    }
    // Also reply on the POST response (some clients read it)
    if (!res.headersSent) res.json(payload);
    else res.end();
  }

  function jsonRpcResult(result: unknown) {
    return { jsonrpc: "2.0", id: msg.id, result };
  }
  function jsonRpcError(code: number, message: string) {
    return { jsonrpc: "2.0", id: msg.id, error: { code, message } };
  }

  try {
    switch (msg.method) {
      case "initialize": {
        sendSse(jsonRpcResult({
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "replit-mcp-server", version: "1.0.0" },
        }));
        break;
      }

      case "notifications/initialized":
      case "ping": {
        if (!res.headersSent) res.status(200).end();
        break;
      }

      case "tools/list": {
        const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        sendSse(jsonRpcResult({ tools }));
        break;
      }

      case "tools/call": {
        const { name, arguments: args = {} } = (msg.params ?? {}) as {
          name: string;
          arguments?: Record<string, unknown>;
        };

        const tool = mcpToolRegistry.get(name);
        if (!tool) {
          sendSse(jsonRpcError(-32601, `Tool '${name}' not found`));
          break;
        }

        const start = Date.now();
        try {
          const result = await dispatchTool(name, args);
          const duration = Date.now() - start;
          incrementToolCall(name, duration, false);

          await db.insert(auditLogsTable).values({
            level: "info",
            tool: name,
            message: `MCP SSE tool call: ${name}`,
            metadata: { args },
            duration: duration / 1000,
          }).catch(() => {});

          sendSse(jsonRpcResult({
            content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
            isError: false,
          }));
        } catch (err: unknown) {
          const duration = Date.now() - start;
          incrementToolCall(name, duration, true);
          const errMsg = err instanceof Error ? err.message : "Tool error";

          await db.insert(auditLogsTable).values({
            level: "error",
            tool: name,
            message: `MCP SSE tool error: ${name} — ${errMsg}`,
            metadata: { args },
            duration: duration / 1000,
          }).catch(() => {});

          sendSse(jsonRpcResult({
            content: [{ type: "text", text: `Error: ${errMsg}` }],
            isError: true,
          }));
        }
        break;
      }

      default:
        sendSse(jsonRpcError(-32601, `Method not found: ${msg.method}`));
    }
  } catch (err) {
    sendSse(jsonRpcError(-32603, "Internal error"));
  }
});

router.get("/mcp/tools", async (_req, res): Promise<void> => {
  const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  res.json({
    name: "replit-mcp-server",
    version: "1.0.0",
    tools,
  });
});

router.post("/mcp/tools/call", async (req, res): Promise<void> => {
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
    // Dispatch to internal API handlers
    const result = await dispatchTool(name, args);
    const duration = Date.now() - start;
    incrementToolCall(name, duration, false);

    // Log the tool call
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

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Dynamically dispatch to internal route logic
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
