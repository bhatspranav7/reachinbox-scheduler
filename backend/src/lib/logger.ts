import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: env.NODE_ENV === "production" ? undefined : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
});

/**
 * Error text that is safe to log or show: drops the "params: ..." part of
 * database errors (it can contain secrets such as OAuth tokens) and prefers
 * the driver's underlying reason (e.g. a constraint violation).
 */
export function safeErrorMessage(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string; code?: string } };
  const cause = e?.cause?.message ? `${e.cause.message}${e.cause.code ? ` (${e.cause.code})` : ""}` : null;
  const own = (e?.message ?? String(err)).split("\nparams:")[0];
  return (cause ?? own).slice(0, 300);
}
