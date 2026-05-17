import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const envVarsTable = pgTable("env_vars", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  redacted: boolean("redacted").notNull().default(false),
  group: text("group"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEnvVarSchema = createInsertSchema(envVarsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnvVar = z.infer<typeof insertEnvVarSchema>;
export type EnvVar = typeof envVarsTable.$inferSelect;
