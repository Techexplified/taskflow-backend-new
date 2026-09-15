// src/middleware/auth.ts
//
// Same pattern as Cardlytics: verifies the caller's Trello token against
// the Trello API, then caches the result for 5 minutes so we don't hit
// Trello on every single request.

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

// Extend Express Request type to carry user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        atlassianId: string;
        email?: string;
        displayName?: string;
      };
    }
  }
}

const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_MAX_SIZE = 5000;

const tokenCache = new Map<
  string,
  { atlassianId: string; email: string; displayName: string; expiresAt: number }
>();

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }

  const token = authHeader.split(" ")[1];

  // Check cache first — valid for 5 minutes
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = {
      atlassianId: cached.atlassianId,
      email: cached.email,
      displayName: cached.displayName,
    };
    return next();
  }

  try {
    // Verify token with Trello API
    const trelloRes = await fetch(
      `https://api.trello.com/1/members/me?key=${env.TRELLO_API_KEY}&token=${token}`,
    );
    if (!trelloRes.ok) return res.status(401).json({ error: "invalid_token" });

    const member = await trelloRes.json();
    const atlassianId = member.id; // stable Trello member ID
    const email = member.email || "";
    const displayName = member.fullName || "";

    // Size guard — clear the whole cache if it grows too large
    if (tokenCache.size >= TOKEN_CACHE_MAX_SIZE) {
      tokenCache.clear();
    }

    tokenCache.set(token, {
      atlassianId,
      email,
      displayName,
      expiresAt: Date.now() + TOKEN_CACHE_TTL,
    });

    req.user = { atlassianId, email, displayName };
    return next();
  } catch (err) {
    console.error("Auth middleware failed", err);
    return res.status(401).json({ error: "auth_failed" });
  }
}
