import { sql } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { runMigrations } from "../src/db/migrate";
import { redis } from "../src/lib/redis";
import { emailQueue } from "../src/queue/email.queue";

/** Fresh schema + empty tables + empty Redis DB + empty queue. */
export async function resetState() {
  await runMigrations();
  await db.execute(sql`TRUNCATE users, senders, campaigns, emails, slack_connections RESTART IDENTITY CASCADE`);
  await redis.flushdb();
  await emailQueue.obliterate({ force: true });
}

export async function createUser(email = "tester@example.com") {
  const [u] = await db.insert(schema.users).values({ googleId: `g-${email}`, email, name: "Tester" }).returning();
  return u;
}

/** Polls until `check` returns true (or throws after `timeoutMs`). */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 20_000, stepMs = 150) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error("waitFor: condition not met in time");
}

export async function closeAll() {
  await emailQueue.close();
  await redis.quit();
  await pool.end();
}
