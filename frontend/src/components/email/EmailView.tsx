"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Clock, ExternalLink, PauseCircle, Star } from "lucide-react";
import { Avatar, Button, Pill } from "@/components/ui";
import { useEmail } from "@/hooks/useEmails";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { EmailDetail } from "@/types/api";

/** Renders the (user-written) HTML body in a sandboxed iframe – no scripts, auto height. */
function BodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(html);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font:13px/1.65 "Inter Variable",system-ui,sans-serif;color:#1a1a1a;word-wrap:break-word}
    blockquote{border-left:2px solid #c9c9c9;margin:0;padding-left:12px;color:#777}
    img{max-width:100%}</style></head><body>${isHtml ? html : html.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</body></html>`;
  return (
    <iframe
      ref={ref}
      title="Email body"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={() => setHeight((ref.current?.contentDocument?.body.scrollHeight ?? 100) + 16)}
      style={{ height }}
      className="w-full border-0"
    />
  );
}

function StatusLine({ e }: { e: EmailDetail }) {
  const items: React.ReactNode[] = [];
  if (e.status === "scheduled")
    items.push(
      <Pill key="s" tone="scheduled" icon={<Clock className="h-3 w-3" />}>
        Scheduled · {formatRelative(e.scheduledAt)}
      </Pill>,
    );
  if (e.status === "delayed")
    items.push(
      <Pill key="d" tone="delayed" icon={<PauseCircle className="h-3 w-3" />}>
        Rate-limited · moved to {formatDateTime(e.scheduledAt)}
      </Pill>,
    );
  if (e.status === "sending") items.push(<Pill key="g" tone="sending">Sending…</Pill>);
  if (e.status === "sent") items.push(<Pill key="t" tone="sent">Sent</Pill>);
  if (e.status === "failed") items.push(<Pill key="f" tone="failed">Failed</Pill>);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
      {items}
      {e.rescheduleCount > 0 && <span>originally {formatDateTime(e.originalScheduledAt)}</span>}
      {e.attempts > 1 && <span>{e.attempts} attempts</span>}
      {e.previewUrl && (
        <a href={e.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
          View in Ethereal <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {e.error && <span className="text-red-600">{e.error}</span>}
    </div>
  );
}

export function EmailView({ id }: { id: string }) {
  const { data: session } = useSession();
  const { data: e, error, isLoading } = useEmail(id);

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={e && (e.status === "sent" || e.status === "failed") ? "/dashboard?tab=sent" : "/dashboard"} aria-label="Back" className="rounded-md p-1 hover:bg-ink-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-lg font-medium text-ink-900">{e?.subject ?? (isLoading ? "" : "Email")}</h1>
        </div>
        <div className="flex items-center gap-3 text-ink-400">
          <Star className="h-4 w-4" aria-hidden />
          <Avatar src={session?.user?.image} name={session?.user?.name} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-10">
        {isLoading && !e ? (
          <div className="space-y-3 pt-4">
            <div className="h-9 w-72 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
          </div>
        ) : error || !e ? (
          <div className="py-24 text-center text-sm">
            <p className="font-medium text-ink-900">Email not found</p>
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="mt-4">
                Back to inbox
              </Button>
            </Link>
          </div>
        ) : (
          <article>
            <div className="flex items-start gap-3">
              <Avatar name={e.senderName} className="h-8 w-8 bg-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  <span className="font-semibold text-ink-900">{e.senderName}</span> <span className="text-2xs text-ink-500">&lt;{e.senderEmail}&gt;</span>
                </p>
                <p className="text-2xs text-ink-500">to {e.toEmail}</p>
              </div>
              <time className="shrink-0 text-2xs text-ink-500" dateTime={e.sentAt ?? e.scheduledAt}>
                {formatDateTime(e.sentAt ?? e.scheduledAt)}
              </time>
            </div>
            <div className="pl-11">
              <StatusLine e={e} />
              <div className="mt-6">
                <BodyFrame html={e.body} />
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
