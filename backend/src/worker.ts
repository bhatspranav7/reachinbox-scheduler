/** Standalone worker process – run as many of these as you like (horizontal scaling). */
import { logger } from "./lib/logger";
import { runMigrations } from "./db/migrate";
import { ensureSenders, closeTransports } from "./services/sender.service";
import { initSearch } from "./services/search.service";
import { startEmailWorker } from "./queue/email.worker";
import { reconcilePendingEmails } from "./queue/reconcile";
import { redis } from "./lib/redis";
import { pool } from "./db";

async function main() {
  await runMigrations();
  await ensureSenders();
  await initSearch();
  await reconcilePendingEmails();
  const worker = startEmailWorker();

  const shutdown = async () => {
    logger.info("worker shutting down…");
    await worker.close();
    closeTransports();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
