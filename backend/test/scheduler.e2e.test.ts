import { SMTPServer } from "smtp-server";
import { eq } from "drizzle-orm";
import type { Worker } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { redis } from "../src/lib/redis";
import { HOUR_MS, hourWindowStart } from "../src/lib/time";
import { createCampaign } from "../src/services/campaign.service";
import { closeTransports, ensureSenders } from "../src/services/sender.service";
import { emailQueue, enqueueEmails } from "../src/queue/email.queue";
import { startEmailWorker, toMailBody } from "../src/queue/email.worker";
import { reconcilePendingEmails } from "../src/queue/reconcile";
import { closeAll, createUser, resetState, waitFor } from "./helpers";

/**
 * End-to-end: real Postgres + Redis + BullMQ worker + a fake SMTP server that
 * records every message it receives. Proves the "hard constraints" of the brief.
 */
interface Received {
  to: string;
  messageId: string;
}
let inbox: Received[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onAuth: (_a, _s, cb) => cb(null, { user: "test" }),
  onData(stream, session, cb) {
    let raw = "";
    stream.on("data", (c) => (raw += c));
    stream.on("end", () => {
      inbox.push({ to: session.envelope.rcptTo.map((r) => r.address).join(","), messageId: raw.match(/^Message-ID: (.*)$/im)?.[1]?.trim() ?? "" });
      cb();
    });
  },
});

let worker: Worker | null = null;
let userId: string;

const statusOf = async (campaignId: string) =>
  db.select().from(schema.emails).where(eq(schema.emails.campaignId, campaignId)).orderBy(schema.emails.sequence);

describe("scheduler end-to-end", () => {
  beforeAll(async () => {
    await new Promise<void>((r) => smtp.listen(2526, "127.0.0.1", r));
  });

  beforeEach(async () => {
    await worker?.close();
    worker = null;
    await resetState();
    await ensureSenders();
    userId = (await createUser()).id;
    inbox = [];
  });

  afterAll(async () => {
    await worker?.close();
    closeTransports();
    await new Promise<void>((r) => smtp.close(() => r()));
    await closeAll();
  });

  it("sends every email exactly once – even when jobs are enqueued again", async () => {
    worker = startEmailWorker();
    const { campaign, scheduled } = await createCampaign({
      userId,
      subject: "Hello",
      body: "<p>Hi <b>there</b></p>",
      recipients: ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "A@X.COM" /* duplicate */],
      startTime: new Date(),
      delayMs: 0,
      hourlyLimit: 100,
    });
    expect(scheduled).toBe(5); // duplicate recipient removed

    // Simulate a retried API call / a second process re-enqueueing the same emails.
    const rows = await statusOf(campaign.id);
    await enqueueEmails(rows.map((r) => ({ runAt: r.scheduledAt, data: { emailId: r.id, campaignId: r.campaignId, userId, senderId: r.senderId, campaignHourlyLimit: 100, campaignDelayMs: 0 } })));
    await redis.del("lock:reconcile");
    await reconcilePendingEmails();

    await waitFor(async () => (await statusOf(campaign.id)).every((e) => e.status === "sent"));
    await new Promise((r) => setTimeout(r, 500)); // give any duplicate a chance to show up

    expect(inbox).toHaveLength(5);
    expect(new Set(inbox.map((m) => m.to)).size).toBe(5);
    expect(new Set(inbox.map((m) => m.messageId)).size).toBe(5);
    const senders = new Set((await statusOf(campaign.id)).map((e) => e.senderId));
    expect(senders.size).toBe(2); // round-robin across the sender pool
  });

  it("a double-submitted campaign (same idempotency key) is created once", async () => {
    const input = {
      userId,
      subject: "Once",
      body: "x",
      recipients: ["one@x.com"],
      startTime: new Date(Date.now() + 60_000),
      delayMs: 0,
      hourlyLimit: 10,
      idempotencyKey: "click-1",
    };
    const first = await createCampaign(input);
    const second = await createCampaign(input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await db.select().from(schema.campaigns)).toHaveLength(1);
    expect(await emailQueue.getJobCounts("delayed")).toMatchObject({ delayed: 1 });
  });

  it("restart: if Redis lost the jobs, startup reconciliation re-creates them from Postgres", async () => {
    const { campaign } = await createCampaign({
      userId,
      subject: "Recover",
      body: "x",
      recipients: ["r1@x.com", "r2@x.com", "r3@x.com"],
      startTime: new Date(Date.now() + 1000),
      delayMs: 0,
      hourlyLimit: 100,
    });
    await emailQueue.obliterate({ force: true }); // "Redis was wiped while the server was down"
    expect(await emailQueue.count()).toBe(0);

    await redis.del("lock:reconcile");
    await reconcilePendingEmails(); // what index.ts runs on boot
    worker = startEmailWorker();

    await waitFor(async () => (await statusOf(campaign.id)).every((e) => e.status === "sent"));
    expect(inbox.map((m) => m.to).sort()).toEqual(["r1@x.com", "r2@x.com", "r3@x.com"]);
  });

  it("hourly limit: extra emails are rescheduled to the next hour in order, never dropped", async () => {
    // Strict order is guaranteed for jobs reserved one after another. With concurrency > 1,
    // jobs that hit the limit in the same millisecond may swap between two adjacent hours
    // ("preserve order as much as possible" – see README trade-offs), so pin it to 1 here.
    worker = startEmailWorker({ concurrency: 1 });
    const { campaign } = await createCampaign({
      userId,
      subject: "Limited",
      body: "x",
      recipients: ["l1@x.com", "l2@x.com", "l3@x.com", "l4@x.com", "l5@x.com"],
      startTime: new Date(),
      delayMs: 0,
      hourlyLimit: 2, // campaign limit from the compose form
    });

    await waitFor(async () => {
      const rows = await statusOf(campaign.id);
      return rows.filter((e) => e.status === "sent").length === 2 && rows.filter((e) => e.status === "delayed").length === 3;
    });

    const rows = await statusOf(campaign.id);
    const delayed = rows.filter((e) => e.status === "delayed");
    const nextHour = hourWindowStart(Date.now()) + HOUR_MS;
    expect(delayed.every((e) => e.scheduledAt.getTime() >= nextHour)).toBe(true);
    // order kept: later recipients never run before earlier ones
    const times = delayed.map((e) => e.scheduledAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // still queued – nothing failed or dropped
    expect(await emailQueue.getJobCounts("delayed", "failed")).toMatchObject({ delayed: 3, failed: 0 });
  });

  it("hourly limit under concurrency: never exceeds the limit and never drops, whatever the timing", async () => {
    worker = startEmailWorker({ concurrency: 5 });
    const { campaign } = await createCampaign({
      userId,
      subject: "Concurrent",
      body: "x",
      recipients: Array.from({ length: 12 }, (_, i) => `c${i}@x.com`),
      startTime: new Date(),
      delayMs: 0,
      hourlyLimit: 3,
    });
    await waitFor(async () => (await statusOf(campaign.id)).every((e) => e.status === "sent" || e.status === "delayed"));
    const rows = await statusOf(campaign.id);
    expect(rows.filter((e) => e.status === "sent")).toHaveLength(3);
    const perHour = new Map<number, number>();
    for (const e of rows.filter((r) => r.status === "delayed")) {
      const h = Math.floor(e.scheduledAt.getTime() / HOUR_MS);
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
    }
    expect([...perHour.values()].sort()).toEqual([3, 3, 3]); // 9 overflow → exactly 3 per following hour
  });

  it("crash mid-send: an abandoned in-flight email is marked failed, never sent twice", async () => {
    const { campaign } = await createCampaign({
      userId,
      subject: "Crash",
      body: "x",
      recipients: ["crash@x.com"],
      startTime: new Date(Date.now() + 60_000),
      delayMs: 0,
      hourlyLimit: 10,
    });
    // A previous worker claimed this email 2 minutes ago and then died.
    await db
      .update(schema.emails)
      .set({ status: "sending", lockedAt: new Date(Date.now() - 120_000), scheduledAt: new Date() })
      .where(eq(schema.emails.campaignId, campaign.id));
    const [row] = await statusOf(campaign.id);
    await (await emailQueue.getJob(row.id))!.changeDelay(0);

    worker = startEmailWorker();
    await waitFor(async () => (await statusOf(campaign.id))[0].status === "failed");
    expect(inbox).toHaveLength(0);
    expect((await statusOf(campaign.id))[0].error).toMatch(/outcome unknown/i);
  });
});

describe("toMailBody", () => {
  it("sends HTML from the editor with a plain-text alternative", () => {
    const { html, text } = toMailBody("<p>Hi <b>Asha</b></p><ul><li>One</li></ul>");
    expect(html).toContain("<b>Asha</b>");
    expect(text).toBe("Hi Asha\nOne");
  });

  it("escapes plain-text bodies sent through the API", () => {
    const { html, text } = toMailBody("1 < 2\nbye");
    expect(text).toBe("1 < 2\nbye");
    expect(html).toBe("1 &lt; 2<br/>bye");
  });
});
