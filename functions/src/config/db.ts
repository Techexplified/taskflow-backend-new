// src/config/db.ts
//
// Unlike Cardlytics' getDb() (which lazily connects on first request),
// this connects EAGERLY and ONCE at startup — local.ts awaits
// connectToDatabase() before app.listen(), so the server never accepts
// traffic without a live Mongo connection.
import { MongoClient, Db } from "mongodb";
import { env } from "./env";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db) return db; // already connected — reuse

  client = new MongoClient(env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    tls: true,
    tlsAllowInvalidCertificates: false,
  });

  await client.connect();

  // Confirms the connection is actually alive, not just that the client
  // object was constructed — ping is the standard way to verify this.
  await client.db(env.MONGO_DB_NAME).command({ ping: 1 });

  db = client.db(env.MONGO_DB_NAME);
  console.log(`✅ MongoDB connected → db: ${env.MONGO_DB_NAME}`);

  return db;
}

// Accessor for routes/services once connectToDatabase() has already run.
// Throws instead of silently returning undefined — a route trying to use
// this before startup finished is a bug, not something to paper over.
export function getDb(): Db {
  if (!db) {
    throw new Error(
      "Database not connected yet — call connectToDatabase() first",
    );
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
