import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apiKeysTable = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  hashedKey: text("hashed_key").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  requestCount: integer("request_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({ createdAt: true, requestCount: true, lastUsedAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeysTable.$inferSelect;
