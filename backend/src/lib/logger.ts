import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: env.NODE_ENV === "production" ? undefined : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
});
