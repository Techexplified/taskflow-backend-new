import { MongoClient, Db } from "mongodb";
import { env } from "./env";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    tls: true,
    tlsAllowInvalidCertificates: false,
  });

  await client.connect();

  await client.db(env.MONGO_DB_NAME).command({ ping: 1 });

  db = client.db(env.MONGO_DB_NAME);

  console.log(`✅ MongoDB connected → db: ${env.MONGO_DB_NAME}`);

  return db;
}

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
