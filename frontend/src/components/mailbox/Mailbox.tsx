"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Inbox, Send } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { useDebounce } from "@/hooks/useDebounce";
import { useEmails } from "@/hooks/useEmails";
import type { EmailListType, EmailStatus } from "@/types/api";
import { EmailRow, EmailRowSkeleton } from "./EmailRow";
import { Toolbar } from "./Toolbar";

const EMPTY = {
  scheduled: {
    icon: <CalendarClock className="h-6 w-6" />,
    title: "No scheduled emails",
    description: "Compose a new email and upload your leads to schedule a campaign.",
  },
  sent: {
    icon: <Send className="h-6 w-6" />,
    title: "No sent emails yet",
    description: "Emails show up here as soon as the scheduler delivers them.",
  },
} as const;

/** Scheduled / Sent list with search (Elasticsearch), status filter, refresh and pagination. */
export function Mailbox({ type }: { type: EmailListType }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmailStatus | undefined>();
  const [page, setPage] = useState(1);
  const query = useDebounce(search.trim(), 300);
  const { data, error, isLoading, isValidating, mutate } = useEmails(type, query, page, status);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const empty = useMemo(
    () =>
      query || status ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="No matches" description={query ? `Nothing matches “${query}”.` : "No emails with this status."} />
      ) : (
        <EmptyState
          {...EMPTY[type]}
          action={
            type === "scheduled" ? (
              <Link href="/compose">
                <Button variant="outline">Compose</Button>
              </Link>
            ) : undefined
          }
        />
      ),
    [query, status, type],
  );

  return (
    <section className="min-w-0 flex-1">
      <Toolbar
        type={type}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        status={status}
        onStatus={(s) => {
          setStatus(s);
          setPage(1);
        }}
        onRefresh={() => void mutate()}
        refreshing={isValidating && !isLoading}
      />

      {error && !data ? (
        <div className="px-6 py-16 text-center text-sm">
          <p className="font-medium text-red-600">Couldn’t load emails</p>
          <p className="mt-1 text-ink-500">{(error as Error).message}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => mutate()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <ul className="border-t border-ink-200/70" aria-busy={isLoading}>
            {isLoading && !data ? Array.from({ length: 8 }, (_, i) => <EmailRowSkeleton key={i} />) : data?.items.map((e) => <EmailRow key={e.id} email={e} />)}
          </ul>
          {!isLoading && data?.items.length === 0 && empty}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between px-4 py-3 text-2xs text-ink-500">
              <span>
                {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
          {data?.searchEngine && data.items.length > 0 && (
            <p className="px-4 py-2 text-2xs text-ink-400">Search powered by {data.searchEngine === "elasticsearch" ? "Elasticsearch" : "Postgres (Elasticsearch unavailable)"}</p>
          )}
        </>
      )}
    </section>
  );
}
