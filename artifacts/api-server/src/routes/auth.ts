import { Router, type IRouter } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { CreateApiKeyBody } from "@workspace/api-zod";

const router: IRouter = Router();

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "mcp_" + crypto.randomBytes(32).toString("hex");
}

router.get("/auth/keys", async (_req, res): Promise<void> => {
  const keys = await db.select().from(apiKeysTable).orderBy(apiKeysTable.createdAt);
  res.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      permissions: k.permissions,
      requestCount: k.requestCount,
    }))
  );
});

router.post("/auth/keys", async (req, res): Promise<void> => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rawKey = generateKey();
  const prefix = rawKey.substring(0, 12);
  const id = uuidv4();
  const [key] = await db.insert(apiKeysTable).values({
    id,
    name: parsed.data.name,
    prefix,
    hashedKey: hashKey(rawKey),
    permissions: parsed.data.permissions ?? ["read", "write", "execute"],
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
  }).returning();

  res.status(201).json({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    key: rawKey,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    permissions: key.permissions,
  });
});

router.delete("/auth/keys/:keyId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.keyId) ? req.params.keyId[0] : req.params.keyId;
  const [deleted] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, raw)).returning();
  if (!deleted) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.json({ success: true, message: "Key revoked" });
});

export default router;
