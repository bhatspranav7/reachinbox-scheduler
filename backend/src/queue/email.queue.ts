import { Queue, type JobsOptions } from "bullmq";
import { env } from "../config/env";
import { createRedis } from "../lib/redis";

export const EMAIL_QUEUE = "email-send";

export interface EmailJobData {
  emailId: string;
  campaignId: string;
  userId: string;
  senderId: string;
  /** Hourly cap chosen for this campaign in the compose form. */
  campaignHourlyLimit: number;
  /** Delay between emails chosen for this campaign (used to space rescheduled jobs). */
  campaignDelayMs: number;
  /** Set by the worker once a rate-limit slot has been reserved for this job. */
  reservedSlotAt?: number;
}

export const emailQueue = new Queue<EmailJobData, unknown, string>(EMAIL_QUEUE, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Enqueue a delayed job per email.
 *
 * jobId === email.id: BullMQ ignores an add() whose jobId already exists, so
 * re-enqueueing (retries of the API call, startup reconciliation, …) can never
 * create a second job for the same email.
 */
export async function enqueueEmails(items: { data: EmailJobData; runAt: Date }[]) {
  const now = Date.now();
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    await emailQueue.addBulk(
      chunk.map(({ data, runAt }) => ({
        name: "send-email",
        data,
        opts: { jobId: data.emailId, delay: Math.max(0, runAt.getTime() - now) } satisfies JobsOptions,
      })),
    );
  }
}
