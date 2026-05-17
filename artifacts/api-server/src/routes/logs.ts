import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { ListLogsQueryParams } from "@workspace/api-zod";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

router.get("/logs", async (req, res): Promise<void> => {
  const parsed = ListLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { limit, offset, level, tool, since } = parsed.data;

  const conditions = [];
  if (level) conditions.push(eq(auditLogsTable.level, level));
  if (tool) conditions.push(eq(auditLogsTable.tool, tool));
  if (since) conditions.push(gte(auditLogsTable.createdAt, new Date(since)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, totalResult] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit ?? 100)
      .offset(offset ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable).where(where),
  ]);

  res.json({
    entries: entries.map((e) => ({
      id: String(e.id),
      timestamp: e.createdAt.toISOString(),
      level: e.level,
      tool: e.tool,
      message: e.message,
      metadata: e.metadata ?? null,
      keyId: e.keyId ?? null,
      duration: e.duration ?? null,
    })),
    total: totalResult[0]?.count ?? 0,
    limit: limit ?? 100,
    offset: offset ?? 0,
  });
});

export default router;
