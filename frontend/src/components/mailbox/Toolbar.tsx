"use client";

import { useState } from "react";
import { Check, Filter, RotateCw, Search, X } from "lucide-react";
import { IconButton, MenuItem, Popover } from "@/components/ui";
import type { EmailListType, EmailStatus } from "@/types/api";

const FILTERS: Record<EmailListType, { value: EmailStatus | undefined; label: string }[]> = {
  scheduled: [
    { value: undefined, label: "All scheduled" },
    { value: "scheduled", label: "On time" },
    { value: "delayed", label: "Rate-limited" },
  ],
  sent: [
    { value: undefined, label: "All" },
    { value: "sent", label: "Sent" },
    { value: "failed", label: "Failed" },
  ],
};

interface Props {
  type: EmailListType;
  search: string;
  onSearch: (v: string) => void;
  status?: EmailStatus;
  onStatus: (s: EmailStatus | undefined) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/** Search pill + filter + refresh (top of the list in the Figma). */
export function Toolbar({ type, search, onSearch, status, onStatus, onRefresh, refreshing }: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          aria-label="Search emails"
          className="h-9 w-full rounded-full bg-ink-100 pl-9 pr-8 text-[13px] outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/30"
        />
        {search && (
          <button onClick={() => onSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Popover
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        align="left"
        className="w-44 py-1"
        trigger={
          <IconButton label="Filter by status" active={Boolean(status)} onClick={() => setFilterOpen((o) => !o)}>
            <Filter className="h-4 w-4" />
            {status && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />}
          </IconButton>
        }
      >
        {FILTERS[type].map((f) => (
          <MenuItem
            key={f.label}
            active={status === f.value}
            onClick={() => {
              onStatus(f.value);
              setFilterOpen(false);
            }}
          >
            <span className="flex-1">{f.label}</span>
            {status === f.value && <Check className="h-4 w-4" />}
          </MenuItem>
        ))}
      </Popover>
      <IconButton label="Refresh" onClick={onRefresh}>
        <RotateCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </IconButton>
    </div>
  );
}
