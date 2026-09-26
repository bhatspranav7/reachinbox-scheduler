import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Mailbox } from "@/components/mailbox/Mailbox";
import type { EmailListType } from "@/types/api";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const type: EmailListType = tab === "sent" ? "sent" : "scheduled";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense>
        <Sidebar active={type} />
      </Suspense>
      {/* key: reset search / filter / page when switching mailbox */}
      <Mailbox key={type} type={type} />
    </div>
  );
}
