import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const db = drizzle({
  connection: process.env.DATABASE_URL,
  schema,
  ws: ws,
});

export async function ensureAnalyticsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        tenant_id TEXT,
        user_email TEXT,
        policy_count INTEGER,
        policy_types TEXT,
        platforms TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } catch (error) {
    console.error("Failed to ensure analytics table:", error);
  }
}
