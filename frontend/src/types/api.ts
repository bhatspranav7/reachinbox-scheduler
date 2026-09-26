export type EmailStatus = "scheduled" | "delayed" | "sending" | "sent" | "failed";
export type EmailListType = "scheduled" | "sent";

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface EmailItem {
  id: string;
  toEmail: string;
  subject: string;
  /** First ~160 chars of the body, tags stripped. */
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  originalScheduledAt: string;
  sentAt: string | null;
  previewUrl: string | null;
  error: string | null;
  rescheduleCount: number;
  campaignId: string;
  senderEmail: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  searchEngine: "elasticsearch" | "postgres" | null;
}

export interface EmailStats {
  scheduled: number;
  delayed: number;
  sent: number;
  failed: number;
  searchAvailable: boolean;
}

export interface SchedulerConfig {
  senders: { id: string; email: string; name: string }[];
  minDelayBetweenEmailsMs: number;
  maxEmailsPerHourPerSender: number;
  maxEmailsPerHour: number;
  workerConcurrency: number;
}

export interface CreateCampaignPayload {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  idempotencyKey: string;
  senderId?: string;
}

export interface EmailDetail {
  id: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  originalScheduledAt: string;
  sentAt: string | null;
  attempts: number;
  rescheduleCount: number;
  previewUrl: string | null;
  messageId: string | null;
  error: string | null;
  createdAt: string;
  senderEmail: string;
  senderName: string;
  campaignDelayMs: number;
  campaignHourlyLimit: number;
}

export interface CreateCampaignResponse {
  campaign: { id: string; totalEmails: number };
  scheduled: number;
  duplicate: boolean;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  connectedAt: string | null;
}
