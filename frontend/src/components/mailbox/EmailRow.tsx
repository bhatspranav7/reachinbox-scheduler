import Link from "next/link";
import { Clock, PauseCircle, Star } from "lucide-react";
import { Pill } from "@/components/ui";
import { formatPillTime } from "@/lib/format";
import type { EmailItem } from "@/types/api";

/** Status pill: scheduled rows show *when* (orange clock pill), sent rows show the outcome. */
function StatusPill({ email }: { email: EmailItem }) {
  switch (email.status) {
    case "scheduled":
      return (
        <Pill tone="scheduled" icon={<Clock className="h-3 w-3" />} title="Scheduled">
          {formatPillTime(email.scheduledAt)}
        </Pill>
      );
    case "delayed":
      return (
        <Pill tone="delayed" icon={<PauseCircle className="h-3 w-3" />} title="Hourly limit reached – moved to the next available hour">
          {formatPillTime(email.scheduledAt)}
        </Pill>
      );
    case "sending":
      return <Pill tone="sending">Sending…</Pill>;
    case "sent":
      return <Pill tone="sent">Sent</Pill>;
    case "failed":
      return (
        <Pill tone="failed" title={email.error ?? undefined}>
          Failed
        </Pill>
      );
  }
}

const STATUS_LABEL: Record<EmailItem["status"], string> = {
  scheduled: "Scheduled",
  delayed: "Rate-limited",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export function EmailRow({ email }: { email: EmailItem }) {
  const isSent = email.status === "sent" || email.status === "failed";
  return (
    <li>
      <Link
        href={`/emails/${email.id}`}
        className="group flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-200/70 px-4 py-3.5 text-[13px] transition-colors hover:bg-ink-50 md:flex-nowrap md:gap-6"
      >
        <span className="min-w-0 flex-1 truncate text-ink-900 md:w-52 md:flex-none md:shrink-0" title={email.toEmail}>
          <span className="text-ink-500">To:</span> {email.toEmail}
        </span>
        <StatusPill email={email} />
        <span className="order-last min-w-0 basis-full truncate md:order-none md:basis-auto md:flex-1">
          <span className="font-medium text-ink-900">{email.subject}</span>
          {email.preview && <span className="text-ink-400"> - {email.preview.trim()}</span>}
        </span>
        <span className="hidden shrink-0 text-right text-2xs text-ink-400 sm:block">
          {isSent ? formatPillTime(email.sentAt ?? email.scheduledAt) : STATUS_LABEL[email.status]}
        </span>
        <Star className="hidden h-4 w-4 shrink-0 text-ink-300 group-hover:text-ink-400 md:block" aria-hidden />
      </Link>
    </li>
  );
}

export function EmailRowSkeleton() {
  return (
    <li className="flex items-center gap-6 border-b border-ink-200/70 px-4 py-4">
      <div className="h-3.5 w-40 animate-pulse rounded bg-ink-100" />
      <div className="h-4 w-24 animate-pulse rounded-full bg-ink-100" />
      <div className="h-3.5 flex-1 animate-pulse rounded bg-ink-100" />
    </li>
  );
}
