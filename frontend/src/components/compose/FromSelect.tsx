"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MenuItem, Popover } from "@/components/ui";
import type { SchedulerConfig } from "@/types/api";

interface Props {
  senders: SchedulerConfig["senders"];
  value: string | undefined; // undefined = round-robin across all senders
  onChange: (id: string | undefined) => void;
}

/** "From" chip: a single Ethereal sender, or round-robin across the whole pool. */
export function FromSelect({ senders, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = senders.find((s) => s.id === value);
  const label = current ? current.email : senders.length ? `All senders · round-robin (${senders.length})` : "Loading senders…";

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-80 py-1"
      trigger={
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md bg-ink-100 px-2.5 text-[13px] text-ink-900 hover:bg-ink-200/70">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500" />
        </button>
      }
    >
      <MenuItem
        active={!value}
        onClick={() => {
          onChange(undefined);
          setOpen(false);
        }}
      >
        <span className="flex-1">All senders · round-robin</span>
        {!value && <Check className="h-4 w-4" />}
      </MenuItem>
      <div className="my-1 border-t border-ink-200" />
      {senders.map((s) => (
        <MenuItem
          key={s.id}
          active={value === s.id}
          onClick={() => {
            onChange(s.id);
            setOpen(false);
          }}
        >
          <span className="flex-1 truncate">{s.email}</span>
          {value === s.id && <Check className="h-4 w-4" />}
        </MenuItem>
      ))}
    </Popover>
  );
}
