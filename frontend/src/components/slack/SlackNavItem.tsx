"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button, Popover } from "@/components/ui";
import { useApiClient } from "@/hooks/useApi";
import { useSlackStatus } from "@/hooks/useEmails";
import { cn } from "@/lib/cn";

export function SlackIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#E01E5A" d="M5 15.2a2.1 2.1 0 1 1-2.1-2.1H5v2.1Zm1 0a2.1 2.1 0 1 1 4.2 0v5.2a2.1 2.1 0 1 1-4.2 0v-5.2Z" />
      <path fill="#36C5F0" d="M8.1 5a2.1 2.1 0 1 1 2.1-2.1V5H8.1Zm0 1a2.1 2.1 0 1 1 0 4.2H2.9a2.1 2.1 0 1 1 0-4.2h5.2Z" />
      <path fill="#2EB67D" d="M19 8.1a2.1 2.1 0 1 1 2.1 2.1H19V8.1Zm-1 0a2.1 2.1 0 1 1-4.2 0V2.9a2.1 2.1 0 1 1 4.2 0v5.2Z" />
      <path fill="#ECB22E" d="M15.9 19a2.1 2.1 0 1 1-2.1 2.1V19h2.1Zm0-1a2.1 2.1 0 1 1 0-4.2h5.2a2.1 2.1 0 1 1 0 4.2h-5.2Z" />
    </svg>
  );
}

/**
 * "Connect Slack" (real OAuth v2) – lives in the sidebar under Integrations.
 * Alerts are sent the moment a sender / campaign hits its hourly limit.
 */
export function SlackNavItem() {
  const { request } = useApiClient();
  const { data, isLoading, mutate } = useSlackStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "test" | null>(null);
  const params = useSearchParams();
  const router = useRouter();

  // Result of the OAuth redirect (?slack=connected|denied|error)
  useEffect(() => {
    const s = params.get("slack");
    if (!s) return;
    if (s === "connected") toast.success("Slack connected – you'll get alerts when a limit is hit");
    else if (s === "denied") toast.info("Slack connection was cancelled");
    else toast.error(`Slack connection failed${params.get("reason") ? `: ${params.get("reason")!.replace(/_/g, " ")}` : ""}`);
    void mutate();
    const tab = params.get("tab");
    router.replace(tab ? `/dashboard?tab=${tab}` : "/dashboard");
  }, [params, router, mutate]);

  async function run(kind: "connect" | "disconnect" | "test") {
    setBusy(kind);
    try {
      if (kind === "connect") {
        const { url } = await request<{ url: string }>("/api/slack/install-url", { method: "POST" });
        window.location.href = url; // → Slack authorize screen
        return;
      }
      if (kind === "disconnect") {
        await request("/api/slack", { method: "DELETE" });
        toast.success("Slack disconnected");
        await mutate();
        setOpen(false);
      } else {
        await request("/api/slack/test", { method: "POST" });
        toast.success("Test message sent to Slack");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const connected = Boolean(data?.connected);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-64 p-3"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-700 hover:bg-ink-100"
        >
          <SlackIcon />
          <span className="flex-1">Slack alerts</span>
          <span className={cn("h-2 w-2 rounded-full", isLoading ? "bg-ink-200" : connected ? "bg-brand-500" : "bg-ink-300")} title={connected ? "Connected" : "Not connected"} />
        </button>
      }
    >
      <p className="text-sm font-medium text-ink-900">Slack alerts</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        {connected
          ? `Connected to ${data?.teamName}${data?.channelName ? ` · ${data.channelName}` : ""}. You're alerted the moment a sender hits its hourly limit.`
          : data && !data.configured
            ? "The Slack app isn't configured on the server (SLACK_CLIENT_ID / SECRET)."
            : "Get a Slack message the moment a sender hits its hourly limit."}
      </p>
      <div className="mt-3 flex gap-2">
        {connected ? (
          <>
            <Button variant="outline" size="sm" loading={busy === "test"} onClick={() => run("test")}>
              Send test
            </Button>
            <Button variant="danger" size="sm" className="rounded-full" loading={busy === "disconnect"} onClick={() => run("disconnect")}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" loading={busy === "connect"} disabled={isLoading || !data?.configured} onClick={() => run("connect")}>
            Connect Slack
          </Button>
        )}
      </div>
    </Popover>
  );
}
