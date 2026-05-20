import { Router, type IRouter } from "express";
import { getMetrics, getConnections } from "../lib/serverMetrics";
import { mcpToolRegistry } from "../lib/mcpTools";
import { db, apiKeysTable } from "@workspace/db";

const router: IRouter = Router();

// In-memory rate limit tracking
interface RateWindow {
  keyId: string;
  keyName: string;
  count: number;
  windowStart: number;
  blocked: boolean;
}
export const rateLimitWindows = new Map<string, RateWindow>();

router.get("/monitoring/stats", async (_req, res): Promise<void> => {
  const stats = getMetrics();
  res.json(stats);
});

router.get("/monitoring/connections", async (_req, res): Promise<void> => {
  res.json(getConnections());
});

router.get("/monitoring/rate-limits", async (_req, res): Promise<void> => {
  if (!db) { res.json([]); return; }
  const now = Date.now();
  const WINDOW_SECONDS = 60;
  const LIMIT = 100;

  const limits: object[] = [];
  const keys = await db.select().from(apiKeysTable);

  for (const key of keys) {
    const window = rateLimitWindows.get(key.id);
    const requestsInWindow = window && now - window.windowStart < WINDOW_SECONDS * 1000
      ? window.count
      : 0;

    limits.push({
      keyId: key.id,
      keyName: key.name,
      requestsInWindow,
      requestLimit: LIMIT,
      windowSeconds: WINDOW_SECONDS,
      blocked: (window?.blocked ?? false) && requestsInWindow >= LIMIT,
      resetAt: window ? new Date(window.windowStart + WINDOW_SECONDS * 1000).toISOString() : null,
    });
  }

  res.json(limits);
});

router.get("/monitoring/tools", async (_req, res): Promise<void> => {
  const tools = Array.from(mcpToolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    callCount: t.callCount,
    averageMs: t.callCount > 0 ? Math.round(t.totalMs / t.callCount) : 0,
    lastCalledAt: t.lastCalledAt,
    errorRate: t.callCount > 0 ? Math.round((t.errorCount / t.callCount) * 100) / 100 : 0,
  }));
  res.json(tools);
});

export default router;
