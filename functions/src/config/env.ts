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
  ALLOWED_ORIGINS: z.string().default("https://trello.com"),
  DODO_API_KEY: z.string().min(1), // ← new
  DODO_WEBHOOK_SECRET: z.string().min(1), // ← new
  DODO_TASKFLOW_PRODUCT_ID: z.string().min(1), // ← new
  DODO_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"), // ← new
  CHECKOUT_RETURN_URL: z
    .string()
    .default("https://gantt-view-trello-power-up.vercel.app"),
  CHECKOUT_WRAPPER_URL: z.string().default("https://explified.com/checkout"),
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
