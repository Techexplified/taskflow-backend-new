// src/models/users.ts
import { Collection, ObjectId } from "mongodb";
import { getDb } from "../config/db";

export interface UserDocument {
  id?: ObjectId;
  atlassianId: string;
  email?: string;
  displayName?: string;
  plan: "free" | "pro";
  plan_expires_at?: Date;
  dodo_subscription_id?: string; // ← new
  dodo_customer_id?: string; // ← new
  cancel_at_period_end?: boolean; // ← new
  trial_started_at?: Date;
  trial_ends_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export function getUsersCollection(): Collection<UserDocument> {
  const db = getDb();
  return db.collection<UserDocument>("users");
}

export async function createUserIndexes(): Promise<void> {
  const col = getUsersCollection();
  await col.createIndex({ atlassianId: 1 }, { unique: true });
}
