import nodemailer, { type Transporter } from "nodemailer";
import { asc } from "drizzle-orm";
import { env } from "../config/env";
import { db, schema } from "../db";
import type { Sender } from "../db/schema";
import { logger } from "../lib/logger";

/**
 * Sender pool. Each sender is a separate Ethereal SMTP mailbox, so the
 * per-sender rate limit behaves like it would with real provider accounts.
 */
export async function ensureSenders(): Promise<Sender[]> {
  const existing = await db.select().from(schema.senders).orderBy(asc(schema.senders.createdAt));

  // 1) Accounts supplied through env: "user:pass,user:pass"
  const fromEnv = env.ETHEREAL_SENDERS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      return { user: pair.slice(0, idx), pass: pair.slice(idx + 1) };
    });

  for (const acc of fromEnv) {
    if (existing.some((s) => s.smtpUser === acc.user)) continue;
    await db
      .insert(schema.senders)
      .values({ email: acc.user, name: acc.user.split("@")[0], smtpUser: acc.user, smtpPass: acc.pass })
      .onConflictDoNothing();
  }

  // 2) Otherwise auto-provision Ethereal test accounts (persisted, so they survive restarts)
  let count = (await db.select().from(schema.senders)).length;
  while (count < env.SENDER_COUNT && fromEnv.length === 0) {
    try {
      const acc = await nodemailer.createTestAccount();
      await db.insert(schema.senders).values({
        email: acc.user,
        name: `Sender ${count + 1}`,
        smtpUser: acc.user,
        smtpPass: acc.pass,
      });
      logger.info({ sender: acc.user }, "provisioned Ethereal sender");
      count++;
    } catch (err) {
      logger.error({ err: (err as Error).message }, "could not create Ethereal account – set ETHEREAL_SENDERS in .env");
      break;
    }
  }

  const all = await db.select().from(schema.senders).orderBy(asc(schema.senders.createdAt));
  if (all.length === 0) throw new Error("No senders configured. Set ETHEREAL_SENDERS or allow Ethereal auto-provisioning.");
  return all;
}

export async function listSenders() {
  return db.select().from(schema.senders).orderBy(asc(schema.senders.createdAt));
}

const transports = new Map<string, Transporter>();

export function getTransport(sender: Sender): Transporter {
  let t = transports.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true, // re-use SMTP connections across sends
      maxConnections: 2,
    });
    transports.set(sender.id, t);
  }
  return t;
}

export function closeTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}
