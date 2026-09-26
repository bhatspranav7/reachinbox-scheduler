import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { ah, HttpError } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  buildAuthorizeUrl,
  completeOAuth,
  disconnect,
  getConnection,
  isSlackConfigured,
  notifyUser,
} from "../services/slack.service";

export const slackRouter = Router();

/**
 * Step 1 – the dashboard asks for an authorize URL. The OAuth `state` is a
 * short-lived signed token carrying the user id (CSRF protection + tells the
 * callback which user is connecting).
 */
slackRouter.post(
  "/install-url",
  requireAuth,
  ah(async (req, res) => {
    if (!isSlackConfigured()) throw new HttpError(503, "Slack app is not configured on the server (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET)");
    const state = jwt.sign({ sub: req.user!.id, purpose: "slack-oauth" }, env.JWT_SECRET, { expiresIn: "10m" });
    res.json({ url: buildAuthorizeUrl(state) });
  }),
);

/** Step 2 – Slack redirects here with ?code&state. */
slackRouter.get(
  "/oauth/callback",
  ah(async (req, res) => {
    const back = (status: string, extra = "") => res.redirect(`${env.FRONTEND_URL}/dashboard?slack=${status}${extra}`);
    const { code, state, error } = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);
    if (error || !code || !state) return back("denied");

    let userId: string;
    try {
      const payload = jwt.verify(state, env.JWT_SECRET) as jwt.JwtPayload;
      if (payload.purpose !== "slack-oauth") throw new Error("bad purpose");
      userId = String(payload.sub);
    } catch {
      return back("error", "&reason=invalid_state");
    }

    try {
      const conn = await completeOAuth(userId, code);
      await notifyUser(userId, `✅ ReachInbox Scheduler connected to *${conn.teamName}*${conn.channelName ? ` (${conn.channelName})` : ""}. You'll be alerted here when a sender hits its hourly limit.`);
      back("connected");
    } catch (err) {
      logger.error({ err: (err as Error).message }, "Slack OAuth failed");
      back("error", `&reason=${encodeURIComponent((err as Error).message)}`);
    }
  }),
);

slackRouter.get(
  "/status",
  requireAuth,
  ah(async (req, res) => {
    const conn = await getConnection(req.user!.id);
    res.json({
      configured: isSlackConfigured(),
      connected: Boolean(conn),
      teamName: conn?.teamName ?? null,
      channelName: conn?.channelName ?? null,
      connectedAt: conn?.createdAt ?? null,
    });
  }),
);

slackRouter.post(
  "/test",
  requireAuth,
  ah(async (req, res) => {
    const ok = await notifyUser(req.user!.id, "👋 Test notification from ReachInbox Scheduler.");
    if (!ok) throw new HttpError(400, "Slack is not connected or the message could not be delivered");
    res.json({ ok });
  }),
);

slackRouter.delete(
  "/",
  requireAuth,
  ah(async (req, res) => {
    await disconnect(req.user!.id);
    res.json({ ok: true });
  }),
);
