import { inArray, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import { emailQueue, enqueueEmails, type EmailJobData } from "./email.queue";

/**
 * Startup safety net.
 *
 * Normally nothing needs doing after a restart: delayed jobs live in Redis
 * (AOF-persisted) and BullMQ picks them up where it left off. This pass covers
 * the edge cases – Redis data lost, or a crash between the DB insert and the
 * enqueue – by re-adding a job for every pending email that has none.
 * Because jobId === email.id, running it any number of times is safe.
 */
export async function reconcilePendingEmails() {
  // Only one process runs this at a time.
  const lock = await redis.set("lock:reconcile", "1", "EX", 60, "NX");
  if (!lock) return;

  const pending = await db
    .select({
      id: schema.emails.id,
      campaignId: schema.emails.campaignId,
      userId: schema.emails.userId,
      senderId: schema.emails.senderId,
      scheduledAt: schema.emails.scheduledAt,
      hourlyLimit: schema.campaigns.hourlyLimit,
      delayMs: schema.campaigns.delayMs,
    })
    .from(schema.emails)
    .innerJoin(schema.campaigns, eq(schema.emails.campaignId, schema.campaigns.id))
    .where(inArray(schema.emails.status, ["scheduled", "delayed", "sending"]));

  const missing: { data: EmailJobData; runAt: Date }[] = [];
  let retried = 0;
  for (const e of pending) {
    const job = await emailQueue.getJob(e.id);
    if (!job) {
      missing.push({
        runAt: e.scheduledAt,
        data: {
          emailId: e.id,
          campaignId: e.campaignId,
          userId: e.userId,
          senderId: e.senderId,
          campaignHourlyLimit: e.hourlyLimit,
          campaignDelayMs: e.delayMs,
        },
      });
      continue;
    }
    const state = await job.getState();
    if (state === "failed" || state === "completed") {
      // DB says it still needs sending but the job is finished – drop the stale job and re-add.
      await job.remove();
      missing.push({ runAt: e.scheduledAt, data: job.data });
      retried++;
    }
  }
  if (missing.length) await enqueueEmails(missing);
  logger.info({ pending: pending.length, reEnqueued: missing.length, retried }, "startup reconciliation done");
}
