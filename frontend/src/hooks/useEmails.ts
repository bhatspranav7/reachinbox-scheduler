"use client";

import type { EmailDetail, EmailItem, EmailListType, EmailStats, EmailStatus, Paginated, SchedulerConfig, SlackStatus } from "@/types/api";
import { useApi } from "./useApi";

const LIVE = { refreshInterval: 5000 }; // queue state changes on its own – poll for a live view

export function useEmails(type: EmailListType, q: string, page: number, status?: EmailStatus, pageSize = 25) {
  const params = new URLSearchParams({ type, page: String(page), pageSize: String(pageSize) });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  return useApi<Paginated<EmailItem>>(`/api/emails?${params}`, { ...LIVE, keepPreviousData: true });
}

export const useEmail = (id: string) => useApi<EmailDetail>(`/api/emails/${id}`, LIVE);
export const useStats = () => useApi<EmailStats>("/api/emails/stats", LIVE);
export const useSchedulerConfig = () => useApi<SchedulerConfig>("/api/config");
export const useSlackStatus = () => useApi<SlackStatus>("/api/slack/status");
