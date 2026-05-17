import { Router, type IRouter } from "express";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import {
  ExecuteCodeBody,
  KillExecutionSessionParams,
} from "@workspace/api-zod";
import { incrementToolCall } from "../lib/serverMetrics";

const router: IRouter = Router();

interface Session {
  id: string;
  language: string;
  status: "running" | "idle" | "terminated";
  startedAt: string;
  lastUsedAt: string | null;
}

const sessions = new Map<string, Session>();

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,
  /shutdown/,
  /reboot/,
  /mkfs/,
  /dd\s+if=/,
  /fork\s*bomb/,
  /:\(\)\s*\{/,
];

function isSafe(code: string): boolean {
  return !BLOCKED_PATTERNS.some((p) => p.test(code));
}

async function runCode(
  language: "node" | "python" | "bash",
  code: string,
  timeout: number,
  workDir: string | null | undefined,
  env: Record<string, string> | null | undefined
): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number; timedOut: boolean }> {
  const start = Date.now();
  let cmd: string;
  let args: string[];
  const tmpFile = `/tmp/mcp_exec_${Date.now()}`;

  const { writeFile, unlink } = await import("fs/promises");

  switch (language) {
    case "node":
      await writeFile(`${tmpFile}.js`, code, "utf-8");
      cmd = "node";
      args = [`${tmpFile}.js`];
      break;
    case "python":
      await writeFile(`${tmpFile}.py`, code, "utf-8");
      cmd = "python3";
      args = [`${tmpFile}.py`];
      break;
    case "bash":
    default:
      await writeFile(`${tmpFile}.sh`, code, "utf-8");
      cmd = "bash";
      args = [`${tmpFile}.sh`];
      break;
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(cmd, args, {
      cwd: workDir ?? process.cwd(),
      env: { ...process.env, ...(env ?? {}) },
      timeout: timeout * 1000,
    });

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout * 1000);

    child.on("close", async (code) => {
      clearTimeout(timer);
      const duration = (Date.now() - start) / 1000;
      try { await unlink(tmpFile + (language === "node" ? ".js" : language === "python" ? ".py" : ".sh")); } catch { /* ignore */ }
      resolve({ stdout, stderr, exitCode: code ?? -1, duration, timedOut });
    });
  });
}

router.post("/execute", async (req, res): Promise<void> => {
  const parsed = ExecuteCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { language, code, timeout, workDir, env } = parsed.data;

  if (!isSafe(code)) {
    res.status(403).json({ error: "Code contains blocked patterns" });
    return;
  }

  const start = Date.now();
  try {
    const result = await runCode(
      language,
      code,
      timeout ?? 30,
      workDir,
      env as Record<string, string> | null | undefined
    );
    const duration = Date.now() - start;
    incrementToolCall(`execute_${language}`, duration, result.exitCode !== 0);
    res.json({ ...result, sessionId: null });
  } catch (err: unknown) {
    const duration = Date.now() - start;
    incrementToolCall(`execute_${language}`, duration, true);
    res.status(400).json({ error: err instanceof Error ? err.message : "Execution failed" });
  }
});

router.get("/execute/sessions", async (_req, res): Promise<void> => {
  res.json(Array.from(sessions.values()));
});

router.delete("/execute/sessions/:sessionId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const parsed = KillExecutionSessionParams.safeParse({ sessionId: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const session = sessions.get(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  session.status = "terminated";
  sessions.set(parsed.data.sessionId, session);
  res.json({ success: true, message: "Session terminated" });
});

export default router;
