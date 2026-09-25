// src/middleware/auth.ts
//
// Verifies the caller's Trello token against the Trello API, then caches
// the result for 5 minutes so we don't hit Trello on every request.

import { createHash } from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

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
const TRELLO_TIMEOUT_MS = 5000;

// Keyed by a SHA-256 of the token, so raw Trello tokens never sit in memory
// as map keys (they'd show up in heap dumps / debugging output).
const tokenCache = new Map<
  string,
  { atlassianId: string; email: string; displayName: string; expiresAt: number }
>();

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  // Trello tokens are alphanumeric; reject anything else before it goes
  // into a URL.
  if (!/^[A-Za-z0-9]{32,128}$/.test(token)) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const key = hashToken(token);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = {
      atlassianId: cached.atlassianId,
      email: cached.email,
      displayName: cached.displayName,
    };
    return next();
  }

  let trelloRes: globalThis.Response;
  try {
    const url = new URL("https://api.trello.com/1/members/me");
    url.search = new URLSearchParams({
      key: env.TRELLO_API_KEY,
      token,
      fields: "id,email,fullName",
    }).toString();
    trelloRes = await fetch(url, {
      signal: AbortSignal.timeout(TRELLO_TIMEOUT_MS),
    });
  } catch (err) {
    // Network error / timeout talking to Trello — that's OUR problem, not
    // a bad token. Don't send 401 or the frontend may force a re-auth.
    console.error("Trello token check failed (network)", (err as Error).message);
    return res.status(503).json({ error: "auth_unavailable" });
  }

  if (trelloRes.status === 400 || trelloRes.status === 401) {
    return res.status(401).json({ error: "invalid_token" });
  }
  if (!trelloRes.ok) {
    console.error("Trello token check failed, status", trelloRes.status);
    return res.status(503).json({ error: "auth_unavailable" });
  }

  try {
    const member = (await trelloRes.json()) as {
      id?: string;
      email?: string;
      fullName?: string;
    };
    if (!member?.id) return res.status(401).json({ error: "invalid_token" });

    const entry = {
      atlassianId: member.id, // stable Trello member ID
      email: member.email || "",
      displayName: member.fullName || "",
      expiresAt: Date.now() + TOKEN_CACHE_TTL,
    };

    if (tokenCache.size >= TOKEN_CACHE_MAX_SIZE) tokenCache.clear();
    tokenCache.set(key, entry);

    req.user = {
      atlassianId: entry.atlassianId,
      email: entry.email,
      displayName: entry.displayName,
    };
    return next();
  } catch (err) {
    console.error("Trello response parse failed", (err as Error).message);
    return res.status(503).json({ error: "auth_unavailable" });
  }
}
