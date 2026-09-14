// src/local.ts
//
// Local-only dev entrypoint. `npm run dev` runs this directly (not through
// the Firebase emulator) so you get fast iteration against a real Mongo URI
// in your .env.
//
// dotenv.config() must run before ./app (and therefore ./config/env) is
// ever imported — import statements are hoisted above this code, so
// dotenv needs its own file that's imported first. Same pattern as
// Cardlytics' local.ts.
import * as dotenv from "dotenv";
dotenv.config();

// Static imports are safe here even though Mongo isn't connected yet —
// app.ts only calls getDb() inside request handlers (e.g. /health), never
// at import time. Only the *listening* has to wait for the DB.
import app from "./app";
import { connectToDatabase } from "./config/db";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function start() {
  try {
    // ── Connect to Mongo FIRST ──────────────────────────────
    // Server does not start listening until this resolves.
    await connectToDatabase();

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
