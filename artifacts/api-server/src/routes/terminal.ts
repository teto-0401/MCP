import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import {
  CreateTerminalSessionBody,
  KillTerminalSessionParams,
  TerminalExecuteBody,
} from "@workspace/api-zod";
import { incrementToolCall } from "../lib/serverMetrics";

const router: IRouter = Router();

interface TerminalSession {
  id: string;
  name: string;
  status: "active" | "idle" | "terminated";
  createdAt: string;
  shell: string;
  workDir: string | null;
  pid: number | null;
}

const sessions = new Map<string, TerminalSession>();

const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\//,
  /shutdown/,
  /reboot/,
  /mkfs/,
  /dd\s+if=/,
];

function isCommandSafe(cmd: string): boolean {
  return !BLOCKED_COMMANDS.some((p) => p.test(cmd));
}

router.get("/terminal/sessions", async (_req, res): Promise<void> => {
  res.json(Array.from(sessions.values()));
});

router.post("/terminal/sessions", async (req, res): Promise<void> => {
  const parsed = CreateTerminalSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = uuidv4();
  const session: TerminalSession = {
    id,
    name: parsed.data.name,
    status: "idle",
    createdAt: new Date().toISOString(),
    shell: parsed.data.shell ?? "/bin/bash",
    workDir: parsed.data.workDir ?? null,
    pid: null,
  };
  sessions.set(id, session);
  res.status(201).json(session);
});

router.delete("/terminal/sessions/:sessionId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const parsed = KillTerminalSessionParams.safeParse({ sessionId: raw });
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
  sessions.delete(parsed.data.sessionId);
  res.json({ success: true, message: "Session terminated" });
});

router.post("/terminal/execute", async (req, res): Promise<void> => {
  const parsed = TerminalExecuteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { command, sessionId, timeout, workDir } = parsed.data;

  if (!isCommandSafe(command)) {
    res.status(403).json({ error: "Command blocked by safety controls" });
    return;
  }

  const session = sessionId ? sessions.get(sessionId) : null;
  const cwd = workDir ?? session?.workDir ?? process.cwd();
  const start = Date.now();

  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn("bash", ["-c", command], {
      cwd,
      env: process.env,
    });

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, (timeout ?? 30) * 1000);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, timedOut });
    });
  });

  const duration = (Date.now() - start) / 1000;
  incrementToolCall("run_terminal", Date.now() - start, result.exitCode !== 0);
  res.json({ ...result, duration, sessionId: sessionId ?? null });
});

export default router;
