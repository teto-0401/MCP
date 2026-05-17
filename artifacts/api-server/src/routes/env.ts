import { Router, type IRouter } from "express";
import { db, envVarsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetEnvVarParams, SetEnvVarParams, SetEnvVarBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/env", async (_req, res): Promise<void> => {
  const vars = await db.select().from(envVarsTable).orderBy(envVarsTable.key);
  res.json(
    vars.map((v) => ({
      key: v.key,
      value: v.redacted ? null : v.value,
      redacted: v.redacted,
      group: v.group,
    }))
  );
});

router.get("/env/:key", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const parsed = GetEnvVarParams.safeParse({ key: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [v] = await db.select().from(envVarsTable).where(eq(envVarsTable.key, parsed.data.key));
  if (!v) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }
  res.json({ key: v.key, value: v.redacted ? null : v.value, redacted: v.redacted, group: v.group });
});

router.put("/env/:key", async (req, res): Promise<void> => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const keyParsed = SetEnvVarParams.safeParse({ key: rawKey });
  if (!keyParsed.success) {
    res.status(400).json({ error: keyParsed.error.message });
    return;
  }
  const bodyParsed = SetEnvVarBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const { value, redacted } = bodyParsed.data;
  const [existing] = await db.select().from(envVarsTable).where(eq(envVarsTable.key, keyParsed.data.key));
  let result;
  if (existing) {
    [result] = await db.update(envVarsTable)
      .set({ value, redacted: redacted ?? false })
      .where(eq(envVarsTable.key, keyParsed.data.key))
      .returning();
  } else {
    [result] = await db.insert(envVarsTable)
      .values({ key: keyParsed.data.key, value, redacted: redacted ?? false })
      .returning();
  }
  res.json({ key: result.key, value: result.redacted ? null : result.value, redacted: result.redacted, group: result.group });
});

router.delete("/env/:key", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const parsed = GetEnvVarParams.safeParse({ key: raw });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [deleted] = await db.delete(envVarsTable).where(eq(envVarsTable.key, parsed.data.key)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }
  res.json({ success: true, message: "Variable deleted" });
});

export default router;
