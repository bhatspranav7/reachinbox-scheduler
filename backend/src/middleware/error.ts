import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger, safeErrorMessage } from "../lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps async route handlers so rejections reach the error middleware (Express 4). */
export const ah =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  logger.error({ err: safeErrorMessage(err), stack: (err as Error)?.stack?.split("\n").slice(1, 4).join(" | ") }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
