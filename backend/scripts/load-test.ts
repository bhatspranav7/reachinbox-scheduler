/**
 * Load test: schedules N emails (default 1000) for "right now" and prints how
 * the scheduler spreads them across hour windows once the limits kick in.
 *
 *   npm run loadtest -- 1000
 *
 * Uses the same service the API uses, so it exercises the real queue + worker
 * (keep the API/worker running in another terminal).
 */
import { eq, sql } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { createCampaign } from "../src/services/campaign.service";
import { emailQueue } from "../src/queue/email.queue";
import { redis } from "../src/lib/redis";

async function main() {
  const n = Number(process.argv[2] ?? 1000);
  const hourlyLimit = Number(process.argv[3] ?? 10_000);

  const [user] = await db
    .insert(schema.users)
    .values({ googleId: "loadtest", email: "loadtest@local", name: "Load Test" })
    .onConflictDoUpdate({ target: schema.users.googleId, set: { name: "Load Test" } })
    .returning();

  const recipients = Array.from({ length: n }, (_, i) => `lead${i}+${Date.now()}@example.com`);
  const t0 = Date.now();
  const { campaign, scheduled } = await createCampaign({
    userId: user.id,
    subject: `Load test ${new Date().toISOString()}`,
    body: "Load test body",
    recipients,
    startTime: new Date(),
    delayMs: 0,
    hourlyLimit,
  });
  console.log(`scheduled ${scheduled} emails in ${Date.now() - t0} ms (campaign ${campaign.id})`);

  const report = async () => {
    const rows = await db
      .select({
        status: schema.emails.status,
        hour: sql<string>`to_char(date_trunc('hour', ${schema.emails.scheduledAt}), 'YYYY-MM-DD HH24:00')`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.emails)
      .where(eq(schema.emails.campaignId, campaign.id))
      .groupBy(sql`1, 2`)
      .orderBy(sql`2, 1`);
    console.table(rows);
    console.log(await emailQueue.getJobCounts("delayed", "waiting", "active", "completed", "failed"));
  };

  const rounds = Number(process.env.ROUNDS ?? 6);
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    console.log(`\n— after ${(i + 1) * 15}s —`);
    await report();
  }
  await emailQueue.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
