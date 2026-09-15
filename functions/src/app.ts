import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { getDb } from "./config/db";
import { env } from "./config/env";
import { authMiddleware } from "./middleware/auth";
import userRouter from "./routes/user";

const app = express();

// Cloud Run / Firebase emulator sit in front of this as a reverse proxy —
// without this, express-rate-limit can't read req.ip from X-Forwarded-For.
app.set("trust proxy", 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.error(`Blocked origin: ${origin}`);
      return callback(new Error(`Blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

// General API rate limiter — generous since this isn't a payment endpoint,
// just guards against runaway/misbehaving clients.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/users", apiLimiter, authMiddleware, userRouter);

export default app;
