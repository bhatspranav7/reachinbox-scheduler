import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { db, schema } from "../db";

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signSession = (u: AuthUser) => jwt.sign({ sub: u.id, email: u.email }, env.JWT_SECRET, { expiresIn: "7d" });

/** Remembers recently seen users so the existence check doesn't hit the DB on every request. */
const knownUsers = new Map<string, number>();
const KNOWN_TTL_MS = 60_000;

export async function userExists(id: string) {
  const seen = knownUsers.get(id);
  if (seen && Date.now() - seen < KNOWN_TTL_MS) return true;
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id));
  if (row) knownUsers.set(id, Date.now());
  else knownUsers.delete(id);
  return Boolean(row);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  // A valid signature isn't enough: the user must still exist (e.g. after a database reset).
  userExists(String(payload.sub))
    .then((ok) => {
      if (!ok) return res.status(401).json({ error: "Session no longer valid – please sign in again" });
      req.user = { id: String(payload.sub), email: String(payload.email) };
      next();
    })
    .catch(next);
}
