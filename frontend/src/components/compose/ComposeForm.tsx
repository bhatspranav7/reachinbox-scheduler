"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ArrowLeft, Clock, Paperclip } from "lucide-react";
import { Button, IconButton, Input, Popover } from "@/components/ui";
import { useApiClient } from "@/hooks/useApi";
import { useSchedulerConfig } from "@/hooks/useEmails";
import { cn } from "@/lib/cn";
import { formatPillTime } from "@/lib/format";
import type { CreateCampaignPayload, CreateCampaignResponse } from "@/types/api";
import { FromSelect } from "./FromSelect";
import { RecipientsField } from "./RecipientsField";
import { RichTextEditor } from "./RichTextEditor";
import { SendLaterPanel } from "./SendLaterPanel";

function Row({ label, children, rule = true }: { label: string; children: ReactNode; rule?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 py-2", rule && "border-b border-ink-200/70")}>
      <span className="w-14 shrink-0 text-[13px] text-ink-700">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

type Errors = Partial<Record<"recipients" | "subject" | "body" | "delay" | "limit", string>>;

/** Full-page "Compose New Email" screen from the Figma. */
export function ComposeForm() {
  const router = useRouter();
  const { request } = useApiClient();
  const { mutate } = useSWRConfig();
  const { data: config } = useSchedulerConfig();

  const [senderId, setSenderId] = useState<string | undefined>();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delay, setDelay] = useState("");
  const [limit, setLimit] = useState("");
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idemKey = useRef("");
  useEffect(() => {
    idemKey.current = crypto.randomUUID(); // one key per compose → a double click can't schedule twice
  }, []);

  function validate(): Errors {
    const e: Errors = {};
    if (!recipients.length) e.recipients = "Add at least one recipient or upload a list";
    if (!subject.trim()) e.subject = "Subject is required";
    if (!body.trim()) e.body = "Write a message";
    if (delay && (!/^\d+$/.test(delay) || Number(delay) > 86_400)) e.delay = "0 – 86400 seconds";
    if (limit && (!/^\d+$/.test(limit) || Number(limit) < 1)) e.limit = "≥ 1";
    return e;
  }

  async function submit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      return;
    }
    const payload: CreateCampaignPayload = {
      subject: subject.trim(),
      body,
      recipients,
      startTime: (sendAt ?? new Date()).toISOString(),
      delayMs: Number(delay || 0) * 1000,
      hourlyLimit: Number(limit || config?.maxEmailsPerHourPerSender || 100),
      idempotencyKey: idemKey.current,
      senderId,
    };
    setSubmitting(true);
    try {
      const res = await request<CreateCampaignResponse>("/api/campaigns", { method: "POST", body: JSON.stringify(payload) });
      toast.success(
        res.duplicate ? "This campaign was already scheduled" : `${res.scheduled} email${res.scheduled === 1 ? "" : "s"} ${sendAt ? `scheduled for ${formatPillTime(sendAt.toISOString())}` : "queued"}`,
      );
      await mutate((key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/api/emails"));
      router.push("/dashboard?tab=scheduled");
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" aria-label="Back" className="rounded-md p-1 text-ink-900 hover:bg-ink-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-medium text-ink-900">Compose New Email</h1>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Upload lead list (CSV / TXT)" active={files.length > 0} onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
            {files.length > 0 && <span className="absolute bottom-1 right-1 text-[9px] font-semibold leading-none">{files.length}</span>}
          </IconButton>
          <Popover
            open={laterOpen}
            onClose={() => setLaterOpen(false)}
            trigger={
              <IconButton label="Send later" active={Boolean(sendAt)} onClick={() => setLaterOpen((o) => !o)}>
                <Clock className="h-4 w-4" />
              </IconButton>
            }
          >
            <SendLaterPanel
              value={sendAt}
              onCancel={() => setLaterOpen(false)}
              onDone={(d) => {
                setSendAt(d);
                setLaterOpen(false);
              }}
            />
          </Popover>
          <Button variant="outline" size="sm" className="ml-1 h-8 px-4" loading={submitting} onClick={submit}>
            {sendAt ? "Send Later" : "Send"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <Row label="From" rule={false}>
          <FromSelect senders={config?.senders ?? []} value={senderId} onChange={setSenderId} />
        </Row>
        <Row label="To">
          <RecipientsField value={recipients} onChange={setRecipients} fileInputRef={fileRef} onFileLoaded={(n) => setFiles((f) => [...new Set([...f, n])])} />
        </Row>
        <Row label="Subject">
          <Input variant="line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={500} aria-label="Subject" />
        </Row>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-700">
            Delay between 2 emails
            <Input variant="box" inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value.replace(/\D/g, ""))} placeholder="00" aria-describedby="delay-hint" />
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-700">
            Hourly Limit
            <Input variant="box" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} placeholder="00" />
          </label>
          <span id="delay-hint" className="text-2xs text-ink-400">
            delay in seconds · limit = max emails / hour for this campaign
          </span>
        </div>

        <RichTextEditor onChange={setBody} />

        {/* Summary line: detected recipients + timing + limits */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-500">
          <span className={cn(recipients.length ? "text-brand-700" : errors.recipients && "text-red-600")}>
            <strong className="font-semibold">{recipients.length}</strong> email address{recipients.length === 1 ? "" : "es"} detected
          </span>
          <span>{sendAt ? `Starts ${formatPillTime(sendAt.toISOString())}` : "Starts now"}</span>
          {config && (
            <span>
              Each sender: min {config.minDelayBetweenEmailsMs / 1000}s between sends, max {config.maxEmailsPerHourPerSender}/hour — extra emails move to the next hour, never dropped.
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
