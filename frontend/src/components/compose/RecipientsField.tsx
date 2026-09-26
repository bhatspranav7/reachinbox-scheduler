"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { parseLeads } from "@/lib/parseLeads";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VISIBLE = 3;

interface Props {
  value: string[];
  onChange: (emails: string[]) => void;
  /** Lets the header paperclip open the same file picker. */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileLoaded?: (name: string) => void;
}

/**
 * "To" field from the Figma: green email chips (+N overflow), free typing
 * (Enter / comma / paste) and "Upload List" for a CSV or .txt of leads.
 */
export function RecipientsField({ value, onChange, fileInputRef, onFileLoaded }: Props) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (emails: string[]) => {
    const next = [...new Set([...value, ...emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))])];
    onChange(next);
    return next.length - value.length;
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    const invalid = parts.filter((p) => !EMAIL_RE.test(p));
    add(parts);
    setDraft(invalid.join(" "));
    if (invalid.length) toast.error(`Not a valid email: ${invalid[0]}`);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  async function onFile(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error("File is larger than 5 MB");
    const { emails, duplicates } = parseLeads(await f.text());
    if (!emails.length) return toast.error("No email addresses found in this file");
    const added = add(emails);
    onFileLoaded?.(f.name);
    toast.success(`${emails.length} email address${emails.length === 1 ? "" : "es"} detected in ${f.name}`, {
      description: [duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} removed` : null, added < emails.length ? `${emails.length - added} already in the list` : null]
        .filter(Boolean)
        .join(" · ") || undefined,
    });
  }

  const shown = expanded ? value : value.slice(0, VISIBLE);
  const hidden = value.length - shown.length;

  return (
    <div className="flex items-start gap-3">
      <div className="flex min-h-9 flex-1 flex-wrap items-center gap-1.5 py-1" onClick={() => inputRef.current?.focus()}>
        {shown.map((e) => (
          <span key={e} className="group inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-2xs text-ink-900">
            {e}
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onChange(value.filter((x) => x !== e));
              }}
              className="hidden text-ink-500 hover:text-ink-900 group-hover:inline"
              aria-label={`Remove ${e}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-2xs font-medium text-brand-700">
            +{hidden}
          </button>
        )}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commitDraft}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;]/.test(text)) {
              e.preventDefault();
              add(parseLeads(text).emails);
            }
          }}
          placeholder={value.length ? "" : "recipient@example.com"}
          aria-label="Recipients"
          className="h-7 min-w-[120px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-400"
        />
      </div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-2 inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700"
      >
        <Upload className="h-3.5 w-3.5" /> Upload List
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
