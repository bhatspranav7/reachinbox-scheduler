import { DelayedError, Worker, type Job } from "bullmq";
import nodemailer from "nodemailer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db, schema } from "../db";
import type { Email, Sender } from "../db/schema";
import { createRedis } from "../lib/redis";
import { logger } from "../lib/logger";
import { EMAIL_QUEUE, type EmailJobData } from "./email.queue";
import { reserveSendSlot, type LimitScope } from "./rate-limiter";
import { getTransport, listSenders } from "../services/sender.service";
import { indexEmail } from "../services/search.service";
import { notifyRateLimitHit } from "../services/slack.service";
import { HOUR_MS, hourWindowId, hourWindowStart } from "../lib/time";

/** A "sending" row older than this is considered abandoned by a crashed worker. */
export const STALE_LOCK_MS = 60_000;
/** A reserved slot that is older than this when the job runs is re-reserved. */
const RESERVATION_GRACE_MS = 1_500;

let senderCache: Map<string, Sender> = new Map();
async function getSender(id: string) {
  if (!senderCache.has(id)) senderCache = new Map((await listSenders()).map((s) => [s.id, s]));
  const s = senderCache.get(id);
  if (!s) throw new Error(`sender ${id} not found`);
  return s;
}

async function updateEmail(id: string, patch: Partial<Email>) {
  const [row] = await db
    .update(schema.emails)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.emails.id, id))
    .returning();
  if (row) void indexEmail(row);
  return row;
}

/** Moves the job back to the delayed set without consuming a retry attempt. */
async function postpone(job: Job, token: string | undefined, runAt: number): Promise<never> {
  await job.moveToDelayed(runAt, token);
  throw new DelayedError();
}

async function processEmail(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;
  const [email] = await db.select().from(schema.emails).where(eq(schema.emails.id, emailId));

  // ---- idempotency guards -------------------------------------------------
  if (!email) return { skipped: "missing" };
  if (email.status === "sent" || email.status === "failed") return { skipped: email.status };

  const now = Date.now();
  if (email.status === "sending" && email.lockedAt) {
    if (now - email.lockedAt.getTime() < STALE_LOCK_MS) {
      // Another attempt is (or very recently was) in flight – re-check once its lock expires.
      return postpone(job, token, email.lockedAt.getTime() + STALE_LOCK_MS + 1_000);
    }
    // A worker died between "claimed" and "recorded as sent". The SMTP server may or may not
    // have accepted the message, so we choose at-most-once: never auto-resend (no duplicates).
    await updateEmail(email.id, {
      status: "failed",
      lockedAt: null,
      error: "Delivery outcome unknown: the worker stopped mid-send. Not retried automatically to avoid a duplicate.",
    });
    logger.warn({ emailId }, "abandoned in-flight send marked failed (at-most-once)");
    return { skipped: "abandoned-in-flight" };
  }
  if (email.scheduledAt.getTime() > now + 1_000) {
    // Job fired early (e.g. re-enqueued) – honour the DB time.
    return postpone(job, token, email.scheduledAt.getTime());
  }

  // ---- throttling + hourly limits (Redis, shared by all workers) ---------
  const sender = await getSender(email.senderId);
  const reservation = job.data.reservedSlotAt;
  if (reservation !== undefined && now - reservation > RESERVATION_GRACE_MS) {
    // The slot is overdue (e.g. the process was down). It is still counted in the hourly
    // limits, but take a fresh place in the sender's min-gap queue so everything that
    // piled up during the downtime doesn't fire in the same instant.
    const r = await reserveSendSlot({ ...limitArgs(email, job.data), now, gapOnly: true });
    if (r.slotAt > now + 20) {
      await job.updateData({ ...job.data, reservedSlotAt: r.slotAt });
      return postpone(job, token, r.slotAt);
    }
  } else if (reservation === undefined) {
    const r = await reserveSendSlot({ ...limitArgs(email, job.data), now });

    if (r.limitedBy) {
      // Hourly cap reached → the email was booked into the next window with room. Never dropped.
      await updateEmail(email.id, { status: "delayed", scheduledAt: new Date(r.slotAt), rescheduleCount: email.rescheduleCount + 1 });
      logger.info({ emailId, limitedBy: r.limitedBy, runAt: new Date(r.slotAt).toISOString() }, "hourly limit hit - rescheduled");
      const { limit, label } = scopeInfo(r.limitedBy, email, sender, job.data);
      void notifyRateLimitHit({ userId: email.userId, scope: r.limitedBy, scopeLabel: label, limit, windowId: hourWindowId(now), resumesAt: new Date(r.slotAt) });
    }

    if (r.reachedScope && hourWindowId(r.slotAt) === hourWindowId(now)) {
      // This reservation took the last slot of the current hour → alert right away.
      // (Bookings into future hours are already covered by the `limitedBy` alert above.)
      const { limit, label } = scopeInfo(r.reachedScope, email, sender, job.data);
      void notifyRateLimitHit({
        userId: email.userId,
        scope: r.reachedScope,
        scopeLabel: label,
        limit,
        windowId: hourWindowId(r.slotAt),
        resumesAt: new Date(hourWindowStart(r.slotAt) + HOUR_MS),
      });
    }

    if (r.slotAt > now + 20) {
      // Park the job until its slot. It owns the slot now, so it won't be throttled again.
      await job.updateData({ ...job.data, reservedSlotAt: r.slotAt });
      return postpone(job, token, r.slotAt);
    }
  }

  // ---- claim the row atomically (compare-and-set) ------------------------
  const [claimed] = await db
    .update(schema.emails)
    .set({ status: "sending", lockedAt: new Date(), attempts: sql`${schema.emails.attempts} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(schema.emails.id, emailId),
        inArray(schema.emails.status, ["scheduled", "delayed"]),
      ),
    )
    .returning();
  if (!claimed) return { skipped: "already-claimed" };

  // ---- send ---------------------------------------------------------------
  try {
    const info = await getTransport(sender).sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to: claimed.toEmail,
      subject: claimed.subject,
      ...toMailBody(claimed.body),
      // Deterministic Message-ID: if a crash forces a resend, receivers can dedupe on it.
      messageId: `<${claimed.id}@reachinbox-scheduler>`,
      headers: { "X-Campaign-Id": claimed.campaignId },
    });
    await updateEmail(claimed.id, {
      status: "sent",
      sentAt: new Date(),
      lockedAt: null,
      error: null,
      messageId: info.messageId,
      previewUrl: (nodemailer.getTestMessageUrl(info) || null) as string | null,
    });
    logger.info({ emailId, to: claimed.toEmail, sender: sender.email }, "sent");
    return { sent: true };
  } catch (err) {
    const message = (err as Error).message;
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await updateEmail(claimed.id, {
      status: finalAttempt ? "failed" : "scheduled",
      lockedAt: null,
      error: message,
    });
    // A retry must reserve a fresh slot (and count against the limits again).
    if (!finalAttempt) await job.updateData({ ...job.data, reservedSlotAt: undefined });
    logger.warn({ emailId, err: message, finalAttempt }, "send failed");
    throw err; // let BullMQ apply exponential backoff / mark failed
  }
}

/** The compose editor sends HTML; plain-text bodies (API/Postman) are converted. */
export function toMailBody(body: string) {
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  if (isHtml) {
    const text = body
      .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { html: body, text };
  }
  const esc = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return { text: body, html: esc.replace(/\n/g, "<br/>") };
}

function limitArgs(email: Email, data: EmailJobData) {
  return {
    senderId: email.senderId,
    campaignId: email.campaignId,
    gapMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
    senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaignLimit: data.campaignHourlyLimit,
    globalLimit: env.MAX_EMAILS_PER_HOUR,
  };
}

function scopeInfo(scope: LimitScope, email: Email, sender: Sender, data: EmailJobData) {
  switch (scope) {
    case "sender":
      return { scopeId: email.senderId, limit: env.MAX_EMAILS_PER_HOUR_PER_SENDER, label: sender.email };
    case "campaign":
      return { scopeId: email.campaignId, limit: data.campaignHourlyLimit, label: `"${email.subject}"` };
    default:
      return { scopeId: "all", limit: env.MAX_EMAILS_PER_HOUR, label: "global" };
  }
}

export function startEmailWorker(opts: { concurrency?: number } = {}) {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmail, {
    connection: createRedis(),
    concurrency: opts.concurrency ?? env.WORKER_CONCURRENCY,
    // An active job whose worker died is re-queued after this long.
    lockDuration: 30_000,
    maxStalledCount: 3,
  });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "job failed"));
  worker.on("error", (err) => logger.error({ err: err.message }, "worker error"));
  logger.info(
    {
      concurrency: opts.concurrency ?? env.WORKER_CONCURRENCY,
      minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      perSenderHourly: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      globalHourly: env.MAX_EMAILS_PER_HOUR,
    },
    "email worker started",
  );
  return worker;
}
