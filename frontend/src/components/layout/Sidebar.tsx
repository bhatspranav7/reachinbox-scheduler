"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStats } from "@/hooks/useEmails";
import type { EmailListType } from "@/types/api";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { SlackNavItem } from "@/components/slack/SlackNavItem";

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-6 px-2 text-[10px] font-medium uppercase tracking-wider text-ink-400">{children}</p>;
}

function NavItem({ href, icon, label, count, active }: { href: string; icon: ReactNode; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active ? "bg-brand-50 font-medium text-ink-900" : "text-ink-700 hover:bg-ink-100",
      )}
    >
      <span className="text-ink-700">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-2xs text-ink-400">{count}</span>}
    </Link>
  );
}

export function Sidebar({ active }: { active: EmailListType }) {
  const { data: stats } = useStats();
  return (
    <aside className="flex w-full shrink-0 flex-col border-ink-200 px-4 py-5 md:h-screen md:w-[260px] md:sticky md:top-0">
      <Logo />
      <div className="mt-5">
        <UserMenu />
      </div>
      <Link
        href="/compose"
        className="mt-3 flex h-9 items-center justify-center rounded-full border border-brand-500 text-[13px] font-medium text-brand-600 transition-colors hover:bg-brand-50"
      >
        Compose
      </Link>

      <nav aria-label="Mailboxes">
        <SectionLabel>Core</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            href="/dashboard?tab=scheduled"
            icon={<Clock className="h-4 w-4" />}
            label="Scheduled"
            count={stats ? stats.scheduled + stats.delayed : undefined}
            active={active === "scheduled"}
          />
          <NavItem href="/dashboard?tab=sent" icon={<Send className="h-4 w-4" />} label="Sent" count={stats ? stats.sent + stats.failed : undefined} active={active === "sent"} />
        </div>
        <SectionLabel>Integrations</SectionLabel>
        <SlackNavItem />
      </nav>
    </aside>
  );
}
