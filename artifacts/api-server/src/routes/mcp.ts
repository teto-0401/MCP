import { Router, type IRouter } from "express";
import { mcpToolRegistry } from "../lib/mcpTools";
import { incrementToolCall } from "../lib/serverMetrics";
import { db, auditLogsTable } from "@workspace/db";
import { CallMcpToolBody } from "@workspace/api-zod";

const router: IRouter = Router();

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
