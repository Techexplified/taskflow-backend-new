// src/index.ts
import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import app from "./app";
import { connectToDatabase } from "./config/db";
import { createUserIndexes } from "./models/users";

setGlobalOptions({ maxInstances: 10 });

// connectToDatabase() is idempotent (returns the cached db after the
// first call), so this only actually connects once per container —
// subsequent warm invocations reuse it instantly. We cache the promise
// itself (not just call the function) so concurrent requests during a
// cold start all await the SAME connection attempt instead of racing
// to open multiple connections.
let dbReady: Promise<void> | null = null;
function ensureDbReady(): Promise<void> {
  if (!dbReady) {
    dbReady = connectToDatabase()
      .then(() => createUserIndexes())
      .then(() => undefined)
      .catch((err) => {
        dbReady = null; // let the next request retry instead of staying broken forever
        throw err;
      });
  }
  return dbReady;
}

export const taskflowApi = onRequest(async (req, res) => {
  try {
    await ensureDbReady();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    res.status(503).json({ error: "service_unavailable" });
    return;
  }
  app(req, res);
});
