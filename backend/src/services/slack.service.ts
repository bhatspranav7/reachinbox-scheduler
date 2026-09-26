import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { db, schema } from "../db";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";

export const SLACK_SCOPES = ["incoming-webhook", "chat:write"];
export const slackRedirectUri = () => `${env.BACKEND_PUBLIC_URL}/api/slack/oauth/callback`;
export const isSlackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export function buildAuthorizeUrl(state: string) {
  const u = new URL("https://slack.com/oauth/v2/authorize");
  u.searchParams.set("client_id", env.SLACK_CLIENT_ID);
  u.searchParams.set("scope", SLACK_SCOPES.join(","));
  u.searchParams.set("redirect_uri", slackRedirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  team: { id: string; name: string };
  incoming_webhook?: { channel: string; channel_id: string; url: string };
}

/** Exchanges the OAuth `code` and stores (or replaces) the user's Slack connection. */
export async function completeOAuth(userId: string, code: string) {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: slackRedirectUri(),
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`);

  const values = {
    userId,
    teamId: data.team.id,
    teamName: data.team.name,
    channelId: data.incoming_webhook?.channel_id ?? null,
    channelName: data.incoming_webhook?.channel ?? null,
    accessToken: data.access_token,
    webhookUrl: data.incoming_webhook?.url ?? null,
  };
  await db
    .insert(schema.slackConnections)
    .values(values)
    .onConflictDoUpdate({ target: schema.slackConnections.userId, set: { ...values, createdAt: new Date() } });
  return values;
}

export async function getConnection(userId: string) {
  const [row] = await db.select().from(schema.slackConnections).where(eq(schema.slackConnections.userId, userId));
  return row ?? null;
}

export async function disconnect(userId: string) {
  const conn = await getConnection(userId);
  if (!conn) return;
  // Best-effort token revoke; the local row is removed regardless.
  try {
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    });
  } catch {
    /* ignore */
  }
  await db.delete(schema.slackConnections).where(eq(schema.slackConnections.userId, userId));
}

/**
 * Posts a message to the user's Slack. Looked up from the DB on every call,
 * so connecting/disconnecting takes effect immediately – no redeploy/restart.
 * Never throws: a missing/broken Slack connection must not break sending.
 */
export async function notifyUser(userId: string, text: string, blocks?: unknown[]): Promise<boolean> {
  try {
    const conn = await getConnection(userId);
    if (!conn) return false;

    if (conn.webhookUrl) {
      const r = await fetch(conn.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, blocks }),
      });
      if (r.ok) return true;
      logger.warn({ status: r.status }, "Slack webhook failed, trying chat.postMessage");
    }
    if (conn.channelId) {
      const r = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${conn.accessToken}` },
        body: JSON.stringify({ channel: conn.channelId, text, blocks }),
      });
      const data = (await r.json()) as { ok: boolean; error?: string };
      if (data.ok) return true;
      logger.warn({ error: data.error }, "Slack chat.postMessage failed");
    }
    return false;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Slack notification failed");
    return false;
  }
}

/**
 * Sends one Slack alert per (user, limit scope, hour window). With 1000 jobs
 * hitting the same limit, only the first one notifies (Redis SET NX).
 */
export async function notifyRateLimitHit(params: {
  userId: string;
  scope: "sender" | "campaign" | "global";
  scopeLabel: string;
  limit: number;
  windowId: string;
  resumesAt: Date;
}) {
  const key = `slack:ratelimit:${params.userId}:${params.scope}:${params.scopeLabel}:${params.windowId}`;
  const first = await redis.set(key, "1", "EX", 2 * 3600, "NX");
  if (!first) return;

  const scopeText =
    params.scope === "sender"
      ? `Sender *${params.scopeLabel}*`
      : params.scope === "campaign"
        ? `Campaign *${params.scopeLabel}*`
        : "The global sending pool";
  const text = `⚠️ ${scopeText} hit its hourly limit of ${params.limit} emails. Remaining emails were rescheduled – sending resumes at ${params.resumesAt.toISOString()}.`;
  const sent = await notifyUser(params.userId, text, [
    { type: "header", text: { type: "plain_text", text: "⏱ Hourly send limit reached" } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Scope*\n${scopeText}` },
        { type: "mrkdwn", text: `*Limit*\n${params.limit} emails / hour` },
        { type: "mrkdwn", text: `*Window*\n${params.windowId}:00 UTC` },
        { type: "mrkdwn", text: `*Resumes*\n<!date^${Math.floor(params.resumesAt.getTime() / 1000)}^{date_short_pretty} {time}|${params.resumesAt.toISOString()}>` },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: "No emails were dropped – they were moved to the next available hour window." }] },
  ]);
  if (!sent) await redis.del(key); // allow a retry if Slack was not connected / failed
  logger.info({ userId: params.userId, scope: params.scope, sent }, "rate-limit Slack notification");
}
