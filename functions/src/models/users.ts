// src/models/users.ts
//
// Mirrors Cardlytics' models/users.ts, minus the billing/plan fields —
// this project only needs identity, not subscription state (yet).
//
// NOTE: unlike Cardlytics' getDb() (async, lazy-connect), this project's
// getDb() is synchronous — connectToDatabase() already ran at startup
// in local.ts, so there's no `await` here.

import { Collection, ObjectId } from "mongodb";
import { getDb } from "../config/db";

export interface UserDocument {
  id?: ObjectId;
  atlassianId: string; // stable Trello member ID
  email?: string;
  displayName?: string;
  created_at: Date;
  updated_at: Date;
}

// Collection accessor
export function getUsersCollection(): Collection<UserDocument> {
  const db = getDb();
  return db.collection<UserDocument>("users");
}

export async function createUserIndexes(): Promise<void> {
  const col = getUsersCollection();
  await col.createIndex({ atlassianId: 1 }, { unique: true });
}
