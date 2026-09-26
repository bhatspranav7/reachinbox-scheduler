import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const emailStatus = pgEnum("email_status", [
  "scheduled", // waiting in a BullMQ delayed job
  "delayed", // pushed to a later hour window by the rate limiter
  "sending", // claimed by a worker (in-flight)
  "sent",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const senders = pgTable("senders", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  smtpUser: text("smtp_user").notNull(),
  smtpPass: text("smtp_pass").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    delayMs: integer("delay_ms").notNull(),
    hourlyLimit: integer("hourly_limit").notNull(),
    totalEmails: integer("total_emails").notNull(),
    /** Client-supplied key so a double-clicked "Schedule" never creates two campaigns. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("campaigns_user_idem_uq").on(t.userId, t.idempotencyKey)],
);

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => senders.id),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Position inside the campaign – used to keep order when rescheduling. */
    sequence: integer("sequence").notNull(),
    status: emailStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** Original time requested by the user (scheduledAt may move on rate limiting). */
    originalScheduledAt: timestamp("original_scheduled_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    messageId: text("message_id"),
    previewUrl: text("preview_url"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The same recipient can never be queued twice inside one campaign.
    uniqueIndex("emails_campaign_to_uq").on(t.campaignId, t.toEmail),
    index("emails_user_status_idx").on(t.userId, t.status, t.scheduledAt),
    index("emails_status_idx").on(t.status),
  ],
);

export const slackConnections = pgTable("slack_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull(),
  teamName: text("team_name"),
  channelId: text("channel_id"),
  channelName: text("channel_name"),
  accessToken: text("access_token").notNull(),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type EmailStatus = (typeof emailStatus.enumValues)[number];
export type SlackConnection = typeof slackConnections.$inferSelect;
