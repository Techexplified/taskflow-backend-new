// src/app.ts
import express from "express";
import { getDb } from "./config/db";

const app = express();

app.use(express.json());

// /health also confirms Mongo is actually reachable right now (not just
// that it was reachable at boot) — useful once this runs behind Cloud Run.
app.get("/health", async (req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

export default app;
