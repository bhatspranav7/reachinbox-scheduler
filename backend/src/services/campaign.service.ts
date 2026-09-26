import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Email } from "../db/schema";
import { enqueueEmails } from "../queue/email.queue";
import { listSenders } from "./sender.service";
import { indexEmails } from "./search.service";
import { HttpError } from "../middleware/error";

export interface CreateCampaignInput {
  userId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayMs: number;
  hourlyLimit: number;
  idempotencyKey?: string;
  senderId?: string;
}

const normalise = (list: string[]) => [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];

/**
 * Creates a campaign + one row per recipient, then one delayed BullMQ job per row.
 *
 *  - email i is scheduled at startTime + i * delayMs (the per-campaign "delay between emails")
 *  - senders are assigned round-robin so the load spreads across the pool
 *  - DB rows are written in one transaction BEFORE jobs are enqueued; if the
 *    process dies in between, startup reconciliation enqueues them.
 */
export async function createCampaign(input: CreateCampaignInput) {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.userId, input.userId), eq(schema.campaigns.idempotencyKey, input.idempotencyKey)));
    if (existing) return { campaign: existing, scheduled: 0, duplicate: true };
  }

  const recipients = normalise(input.recipients);
  const pool = await listSenders();
  const senders = input.senderId ? pool.filter((s) => s.id === input.senderId) : pool;
  if (senders.length === 0) throw new HttpError(400, "Unknown sender");

  const { campaign, rows } = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(schema.campaigns)
      .values({
        userId: input.userId,
        subject: input.subject,
        body: input.body,
        startTime: input.startTime,
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit,
        totalEmails: recipients.length,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    const rows: Email[] = [];
    const CHUNK = 1000;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const values = recipients.slice(i, i + CHUNK).map((to, j) => {
        const seq = i + j;
        const at = new Date(input.startTime.getTime() + seq * input.delayMs);
        return {
          campaignId: campaign.id,
          userId: input.userId,
          senderId: senders[seq % senders.length].id,
          toEmail: to,
          subject: input.subject,
          body: input.body,
          sequence: seq,
          scheduledAt: at,
          originalScheduledAt: at,
        };
      });
      rows.push(...(await tx.insert(schema.emails).values(values).onConflictDoNothing().returning()));
    }
    return { campaign, rows };
  });

  await enqueueEmails(
    rows.map((r) => ({
      runAt: r.scheduledAt,
      data: {
        emailId: r.id,
        campaignId: campaign.id,
        userId: r.userId,
        senderId: r.senderId,
        campaignHourlyLimit: campaign.hourlyLimit,
        campaignDelayMs: campaign.delayMs,
      },
    })),
  );
  void indexEmails(rows);

  return { campaign, scheduled: rows.length, duplicate: false };
}
