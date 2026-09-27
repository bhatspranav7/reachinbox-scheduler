/**
 * Test environment – runs before any app module is imported, so src/config/env.ts
 * picks these up. Uses a separate database and Redis DB (15) so tests never touch
 * your dev data. Override with TEST_DATABASE_URL / TEST_REDIS_URL (CI does).
 */
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/reachinbox_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:56379/15";
process.env.ELASTICSEARCH_URL = "http://127.0.0.1:1"; // unreachable on purpose: search must never block sending
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "2526"; // fake SMTP server started by the e2e tests
process.env.SMTP_SECURE = "false";
process.env.ETHEREAL_SENDERS = "alice@test.dev:pw1,bob@test.dev:pw2";
process.env.MIN_DELAY_BETWEEN_EMAILS_MS = "100";
process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = "1000";
process.env.MAX_EMAILS_PER_HOUR = "0";
process.env.WORKER_CONCURRENCY = "5";
process.env.SEND_MAX_ATTEMPTS = "2";
process.env.JWT_SECRET = "test-secret-test-secret-1234";
