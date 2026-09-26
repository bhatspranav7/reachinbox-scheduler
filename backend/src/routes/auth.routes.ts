import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env";
import { db, schema } from "../db";
import { ah, HttpError } from "../middleware/error";
import { requireAuth, signSession } from "../middleware/auth";

const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);
export const authRouter = Router();

/**
 * The frontend (NextAuth) completes Google OAuth and forwards the Google
 * ID token here. We verify its signature + audience with Google's public keys,
 * upsert the user and issue our own API session token.
 */
authRouter.post(
  "/google",
  ah(async (req, res) => {
    const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, "GOOGLE_CLIENT_ID is not configured on the backend");

    const ticket = await google.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID }).catch(() => null);
    const p = ticket?.getPayload();
    if (!p?.sub || !p.email) throw new HttpError(401, "Invalid Google ID token");

    const values = { googleId: p.sub, email: p.email, name: p.name ?? null, avatarUrl: p.picture ?? null };
    const [user] = await db
      .insert(schema.users)
      .values(values)
      .onConflictDoUpdate({ target: schema.users.googleId, set: { email: values.email, name: values.name, avatarUrl: values.avatarUrl } })
      .returning();

    res.json({ token: signSession({ id: user.id, email: user.email }), user });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user });
  }),
);
