import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  /** Public URL of this backend (used for the Slack OAuth redirect). */
  BACKEND_PUBLIC_URL: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:55432/reachinbox"),
  REDIS_URL: z.string().default("redis://localhost:56379"),
  ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),
  ELASTICSEARCH_INDEX: z.string().default("emails"),

  JWT_SECRET: z.string().min(16).default("change-me-please-in-production-123"),
  GOOGLE_CLIENT_ID: z.string().default(""),

  // Worker / throughput
  RUN_WORKER: bool(true),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  /** Minimum gap between two sends from the SAME sender (ms). */
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().nonnegative().default(2000),
  /** Per-sender hourly cap. */
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(50),
  /** Global hourly cap across all senders (0 = disabled). */
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().nonnegative().default(200),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // SMTP / Ethereal
  SMTP_HOST: z.string().default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  /** "user:pass,user:pass" – existing Ethereal accounts. If empty, accounts are auto-created. */
  ETHEREAL_SENDERS: z.string().default(""),
  SENDER_COUNT: z.coerce.number().int().positive().default(3),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),

  // Bull Board basic auth (optional)
  BULL_BOARD_USER: z.string().default(""),
  BULL_BOARD_PASSWORD: z.string().default(""),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
