// src/models/users.ts
import { Collection, ObjectId } from "mongodb";
import { getDb } from "../config/db";

export interface UserDocument {
  _id?: ObjectId;
  atlassianId: string;
  email?: string;
  displayName?: string;
  plan: "free" | "pro";
  plan_expires_at?: Date;
  dodo_subscription_id?: string;
  dodo_customer_id?: string;
  cancel_at_period_end?: boolean;
  // Timestamp of the last Dodo event applied to this user. Used to drop
  // stale / out-of-order / replayed webhooks.
  last_payment_event_at?: Date;
  trial_started_at?: Date;
  trial_ends_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export function getUsersCollection(): Collection<UserDocument> {
  return getDb().collection<UserDocument>("users");
}

export async function createUserIndexes(): Promise<void> {
  const col = getUsersCollection();
  await col.createIndex({ atlassianId: 1 }, { unique: true });
}
