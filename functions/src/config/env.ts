// src/config/env.ts
//
// Validates required env vars at startup — fail fast with a clear error
// instead of getting a confusing crash later (e.g. MongoClient hanging
// on an empty connection string).
import { z } from "zod";

const schema = z.object({
  MONGO_URI: z.string().min(1),
  MONGO_DB_NAME: z.string().default("gantt_view"),
  PORT: z.string().default("3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  TRELLO_API_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default("https://trello.com"), // ← new
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "❌ Missing/invalid environment variables:",
    parsed.error.format(),
  );
  process.exit(1);
}

export const env = parsed.data;
