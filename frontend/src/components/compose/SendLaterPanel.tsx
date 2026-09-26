"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { toDateTimeLocal, tomorrowAt } from "@/lib/format";

const PRESETS = [
  { label: "Tomorrow", at: () => tomorrowAt(9) },
  { label: "Tomorrow, 10:00 AM", at: () => tomorrowAt(10) },
  { label: "Tomorrow, 11:00 AM", at: () => tomorrowAt(11) },
  { label: "Tomorrow, 3:00 PM", at: () => tomorrowAt(15) },
];

interface Props {
  value: Date | null;
  onDone: (d: Date | null) => void;
  onCancel: () => void;
}

/** "Send Later" popover: pick a date & time or a preset → becomes the campaign start time. */
export function SendLaterPanel({ value, onDone, onCancel }: Props) {
  const [local, setLocal] = useState(value ? toDateTimeLocal(value) : "");
  const picked = local ? new Date(local) : null;
  const invalid = picked !== null && (Number.isNaN(picked.getTime()) || picked.getTime() < Date.now() - 60_000);

  return (
    <div className="w-72 p-4">
      <p className="text-sm font-medium text-ink-900">Send Later</p>
      <label className="mt-3 flex items-center gap-2 border-b border-ink-200 pb-2">
        <input
          type="datetime-local"
          value={local}
          min={toDateTimeLocal(new Date())}
          onChange={(e) => setLocal(e.target.value)}
          aria-label="Pick date & time"
          className="flex-1 bg-transparent text-xs text-ink-700 outline-none [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <CalendarDays className="pointer-events-none h-4 w-4 text-ink-400" />
      </label>
      {invalid && <p className="mt-1 text-2xs text-red-600">Pick a time in the future</p>}
      <ul className="mt-3 space-y-0.5">
        {PRESETS.map((p) => {
          const at = toDateTimeLocal(p.at());
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => setLocal(at)}
                className={cn("w-full rounded-md px-1 py-1.5 text-left text-xs hover:bg-ink-100", local === at ? "font-medium text-brand-700" : "text-ink-700")}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-700 hover:text-ink-900">
          Cancel
        </button>
        <Button variant="outline" size="sm" className="px-4" disabled={invalid} onClick={() => onDone(picked)}>
          Done
        </Button>
      </div>
    </div>
  );
}
