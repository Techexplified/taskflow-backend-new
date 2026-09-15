// src/local.ts
import * as dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { connectToDatabase } from "./config/db";
import { createUserIndexes } from "./models/users";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function start() {
  try {
    // ── Connect to Mongo FIRST ──────────────────────────────
    await connectToDatabase();

    // ── THEN create indexes — safe now that getDb() has a db ──
    await createUserIndexes();

    app.listen(PORT, () => {
      console.log(`🚀 Gantt View backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error(
      "❌ Failed to start server — MongoDB connection failed:",
      err,
    );
    process.exit(1);
  }
}

start();
