import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone = "scheduled" | "delayed" | "sending" | "sent" | "failed" | "brand";

const tones: Record<PillTone, string> = {
  scheduled: "bg-scheduled-bg text-scheduled-text ring-scheduled-ring",
  delayed: "bg-amber-50 text-amber-700 ring-amber-200",
  sending: "bg-violet-50 text-violet-700 ring-violet-200",
  sent: "bg-ink-100 text-ink-500 ring-ink-200",
  failed: "bg-red-50 text-red-600 ring-red-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-300",
};

export function Pill({ tone, icon, children, title, className }: { tone: PillTone; icon?: ReactNode; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
