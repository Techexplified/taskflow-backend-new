import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authMiddleware } from "./middleware/auth";
import userRouter from "./routes/user";
import checkoutRouter from "./routes/checkout";
import webhookRouter from "./routes/webhook";
import subscriptionRouter from "./routes/subscription";

const app = express();

// Cloud Run / Firebase sit in front of this as a reverse proxy —
// without this, express-rate-limit can't read req.ip from X-Forwarded-For.
app.set("trust proxy", 1);
app.disable("x-powered-by");

const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (server-to-server, e.g. Dodo webhooks) → allow.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Don't throw here: throwing produced a 500 HTML page with a stack
      // trace. Returning false just omits the CORS headers so the browser
      // blocks the response.
      console.warn(`Blocked origin: ${origin}`);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ONE json parser. The `verify` hook captures the raw bytes needed for
// webhook signature checks when running outside Firebase (local dev).
// On Firebase, the platform has already parsed the body and set
// req.rawBody itself, so this parser is skipped there — both paths work.
// (Previously there were two parsers; the first consumed the body so the
// second's verify hook never ran.)
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  }),
);

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

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // Dodo can legitimately burst retries from a few IPs
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/webhooks", webhookLimiter, webhookRouter); // public, signature-verified
app.use("/api/users", apiLimiter, authMiddleware, userRouter);
app.use("/api/checkout", checkoutLimiter, authMiddleware, checkoutRouter);
app.use(
  "/api/subscription",
  checkoutLimiter, // creates a Dodo session per call — keep it tight
  authMiddleware,
  subscriptionRouter,
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// JSON error handler — never leak stack traces / HTML error pages.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "invalid_json" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }
  console.error("Unhandled error", err);
  res.status(500).json({ error: "internal_error" });
});

export default app;
