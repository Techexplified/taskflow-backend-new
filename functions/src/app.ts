import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authMiddleware } from "./middleware/auth";
import userRouter from "./routes/user";
import checkoutRouter from "./routes/checkout";
import webhookRouter from "./routes/webhook";

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

// General API rate limiter — generous since this isn't a payment endpoint,
// just guards against runaway/misbehaving clients.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60, // generous — Dodo can legitimately burst retries
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/webhooks", webhookLimiter, webhookRouter); // ← new, public, no authMiddleware
app.use("/api/users", apiLimiter, authMiddleware, userRouter);
app.use("/api/checkout", checkoutLimiter, authMiddleware, checkoutRouter);

export default app;
