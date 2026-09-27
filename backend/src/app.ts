import express from "express";
import cors from "cors";
import helmet from "helmet";
import basicAuth from "express-basic-auth";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "./config/env";
import { emailQueue } from "./queue/email.queue";
import { authRouter } from "./routes/auth.routes";
import { emailRouter } from "./routes/email.routes";
import { slackRouter } from "./routes/slack.routes";
import { errorHandler } from "./middleware/error";
import { redis } from "./lib/redis";
import { pool } from "./db";
import { isSearchAvailable } from "./services/search.service";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  // ---- live BullMQ dashboard: /admin/queues --------------------------------
  const board = new ExpressAdapter();
  board.setBasePath("/admin/queues");
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  const boardGuard =
    env.BULL_BOARD_USER && env.BULL_BOARD_PASSWORD
      ? basicAuth({ users: { [env.BULL_BOARD_USER]: env.BULL_BOARD_PASSWORD }, challenge: true })
      : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  app.use("/admin/queues", boardGuard, board.getRouter());

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL.split(",").map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", async (_req, res) => {
    const [redisOk, dbOk] = await Promise.all([
      redis.ping().then(() => true).catch(() => false),
      pool.query("select 1").then(() => true).catch(() => false),
    ]);
    const counts = await emailQueue.getJobCounts("delayed", "waiting", "active", "completed", "failed").catch(() => null);
    res.status(redisOk && dbOk ? 200 : 503).json({ ok: redisOk && dbOk, redis: redisOk, db: dbOk, elasticsearch: isSearchAvailable(), queue: counts });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/slack", slackRouter);
  app.use("/api", emailRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);
  return app;
}
