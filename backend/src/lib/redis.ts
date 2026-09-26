import IORedis, { type RedisOptions } from "ioredis";
import { env } from "../config/env";

/** BullMQ requires maxRetriesPerRequest=null for blocking connections. */
const opts: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true };

export const createRedis = () => new IORedis(env.REDIS_URL, opts);

/** Shared connection for rate-limit counters, dedupe keys, etc. */
export const redis = createRedis();
