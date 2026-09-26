import type { Worker } from "bullmq";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { createApp } from "./app";
import { runMigrations } from "./db/migrate";
import { ensureSenders, closeTransports } from "./services/sender.service";
import { initSearch } from "./services/search.service";
import { reconcilePendingEmails } from "./queue/reconcile";
import { startEmailWorker } from "./queue/email.worker";
import { emailQueue } from "./queue/email.queue";
import { redis } from "./lib/redis";
import { pool } from "./db";

async function main() {
  await runMigrations();
  const senders = await ensureSenders();
  logger.info({ senders: senders.map((s) => s.email) }, "sender pool ready");
  await initSearch();
  await reconcilePendingEmails();

  let worker: Worker | null = null;
  if (env.RUN_WORKER) worker = startEmailWorker();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`🚀 API on http://localhost:${env.PORT}  ·  queue dashboard on http://localhost:${env.PORT}/admin/queues`);
  });

  // Graceful shutdown: stop taking jobs, let in-flight sends finish, then exit.
  // Delayed jobs stay in Redis and resume on the next start.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down…");
    server.close();
    await worker?.close();
    await emailQueue.close();
    closeTransports();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
