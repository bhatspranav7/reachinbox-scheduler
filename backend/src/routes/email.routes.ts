import { Router } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import type { EmailStatus } from "../db/schema";
import { ah } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { createCampaign } from "../services/campaign.service";
import { isSearchAvailable, searchEmailIds } from "../services/search.service";
import { listSenders } from "../services/sender.service";
import { env } from "../config/env";

export const emailRouter = Router();
emailRouter.use(requireAuth);

const like = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 10_000;

const createSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50_000),
  recipients: z
    .array(z.string().trim().toLowerCase().regex(EMAIL_RE, "invalid email"))
    .min(1)
    .max(MAX_RECIPIENTS),
  startTime: z.coerce.date(),
  delayMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
  idempotencyKey: z.string().max(100).optional(),
  /** Send everything from one sender instead of round-robin across the pool. */
  senderId: z.string().uuid().optional(),
});

/** POST /api/campaigns – schedule a batch of emails. */
emailRouter.post(
  "/campaigns",
  ah(async (req, res) => {
    const input = createSchema.parse(req.body);
    // Start times in the past just mean "now".
    const startTime = input.startTime.getTime() < Date.now() ? new Date() : input.startTime;
    const result = await createCampaign({ ...input, startTime, userId: req.user!.id });
    res.status(result.duplicate ? 200 : 201).json(result);
  }),
);

emailRouter.get(
  "/campaigns",
  ah(async (req, res) => {
    const rows = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.userId, req.user!.id))
      .orderBy(desc(schema.campaigns.createdAt))
      .limit(50);
    res.json({ campaigns: rows });
  }),
);

const TYPE_STATUSES: Record<"scheduled" | "sent", EmailStatus[]> = {
  scheduled: ["scheduled", "delayed", "sending"],
  sent: ["sent", "failed"],
};

const listSchema = z.object({
  type: z.enum(["scheduled", "sent"]).default("scheduled"),
  /** Optional narrower filter inside the tab, e.g. only "delayed" or only "failed". */
  status: z.enum(["scheduled", "delayed", "sending", "sent", "failed"]).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/emails?type=scheduled|sent&q=…&page=… */
emailRouter.get(
  "/emails",
  ah(async (req, res) => {
    const { type, status, q, page, pageSize } = listSchema.parse(req.query);
    const userId = req.user!.id;
    const statuses = status && TYPE_STATUSES[type].includes(status) ? [status] : TYPE_STATUSES[type];
    const offset = (page - 1) * pageSize;

    const columns = {
      id: schema.emails.id,
      toEmail: schema.emails.toEmail,
      subject: schema.emails.subject,
      preview: sql<string>`left(regexp_replace(${schema.emails.body}, '<[^>]*>', ' ', 'g'), 160)`,
      status: schema.emails.status,
      scheduledAt: schema.emails.scheduledAt,
      originalScheduledAt: schema.emails.originalScheduledAt,
      sentAt: schema.emails.sentAt,
      previewUrl: schema.emails.previewUrl,
      error: schema.emails.error,
      rescheduleCount: schema.emails.rescheduleCount,
      campaignId: schema.emails.campaignId,
      senderEmail: schema.senders.email,
    };

    // --- full-text search through Elasticsearch -----------------------------
    if (q) {
      const hit = await searchEmailIds({ userId, q, statuses, limit: pageSize, offset });
      if (hit) {
        const rows = hit.ids.length
          ? await db
              .select(columns)
              .from(schema.emails)
              .innerJoin(schema.senders, eq(schema.emails.senderId, schema.senders.id))
              .where(inArray(schema.emails.id, hit.ids))
          : [];
        const order = new Map(hit.ids.map((id, i) => [id, i]));
        rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
        return res.json({ items: rows, total: hit.total, page, pageSize, searchEngine: "elasticsearch" });
      }
    }

    // --- plain listing (or search fallback when ES is down) -----------------
    const where = and(
      eq(schema.emails.userId, userId),
      inArray(schema.emails.status, statuses),
      q ? or(ilike(schema.emails.toEmail, like(q)), ilike(schema.emails.subject, like(q))) : undefined,
    );
    const orderBy = type === "scheduled" ? [asc(schema.emails.scheduledAt)] : [desc(schema.emails.sentAt), desc(schema.emails.updatedAt)];

    const [items, [{ total }]] = await Promise.all([
      db
        .select(columns)
        .from(schema.emails)
        .innerJoin(schema.senders, eq(schema.emails.senderId, schema.senders.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(schema.emails).where(where),
    ]);
    res.json({ items, total, page, pageSize, searchEngine: q ? "postgres" : null });
  }),
);

/** GET /api/emails/stats – counts per status for the dashboard cards. */
emailRouter.get(
  "/emails/stats",
  ah(async (req, res) => {
    const rows = await db
      .select({ status: schema.emails.status, n: sql<number>`count(*)::int` })
      .from(schema.emails)
      .where(eq(schema.emails.userId, req.user!.id))
      .groupBy(schema.emails.status);
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<EmailStatus, number>>;
    res.json({
      scheduled: (by.scheduled ?? 0) + (by.sending ?? 0),
      delayed: by.delayed ?? 0,
      sent: by.sent ?? 0,
      failed: by.failed ?? 0,
      searchAvailable: isSearchAvailable(),
    });
  }),
);

/** GET /api/config – limits & senders, shown in the compose modal. */
emailRouter.get(
  "/config",
  ah(async (_req, res) => {
    const senders = await listSenders();
    res.json({
      senders: senders.map((s) => ({ id: s.id, email: s.email, name: s.name })),
      minDelayBetweenEmailsMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      maxEmailsPerHour: env.MAX_EMAILS_PER_HOUR,
      workerConcurrency: env.WORKER_CONCURRENCY,
    });
  }),
);

/** GET /api/emails/:id – full email for the detail view. */
emailRouter.get(
  "/emails/:id",
  ah(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ error: "Email not found" });
    const [row] = await db
      .select({
        email: schema.emails,
        senderEmail: schema.senders.email,
        senderName: schema.senders.name,
        delayMs: schema.campaigns.delayMs,
        hourlyLimit: schema.campaigns.hourlyLimit,
      })
      .from(schema.emails)
      .innerJoin(schema.senders, eq(schema.emails.senderId, schema.senders.id))
      .innerJoin(schema.campaigns, eq(schema.emails.campaignId, schema.campaigns.id))
      .where(and(eq(schema.emails.id, id.data), eq(schema.emails.userId, req.user!.id)));
    if (!row) return res.status(404).json({ error: "Email not found" });
    const { lockedAt: _l, ...email } = row.email;
    res.json({ ...email, senderEmail: row.senderEmail, senderName: row.senderName, campaignDelayMs: row.delayMs, campaignHourlyLimit: row.hourlyLimit });
  }),
);
