"use client";

import { useRef, type ReactNode } from "react";
import {
  AlignCenter,
  Bold,
  ChevronsUpDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  AlignLeft,
} from "lucide-react";

interface Props {
  onChange: (html: string) => void;
  placeholder?: string;
}

type Cmd = { cmd: string; arg?: string; icon: ReactNode; label: string };

const GROUPS: Cmd[][] = [
  [
    { cmd: "undo", icon: <Undo2 />, label: "Undo" },
    { cmd: "redo", icon: <Redo2 />, label: "Redo" },
  ],
  [{ cmd: "fontSize", arg: "5", icon: <Type />, label: "Larger text" }],
  [
    { cmd: "bold", icon: <Bold />, label: "Bold" },
    { cmd: "italic", icon: <Italic />, label: "Italic" },
    { cmd: "underline", icon: <Underline />, label: "Underline" },
  ],
  [
    { cmd: "justifyCenter", icon: <AlignCenter />, label: "Center" },
    { cmd: "justifyLeft", icon: <ChevronsUpDown />, label: "Align left" },
  ],
  [
    { cmd: "insertOrderedList", icon: <ListOrdered />, label: "Numbered list" },
    { cmd: "insertUnorderedList", icon: <List />, label: "Bulleted list" },
    { cmd: "indent", icon: <IndentIncrease />, label: "Indent" },
    { cmd: "outdent", icon: <IndentDecrease />, label: "Outdent" },
    { cmd: "formatBlock", arg: "blockquote", icon: <Quote />, label: "Quote" },
    { cmd: "justifyFull", icon: <AlignLeft />, label: "Justify" },
  ],
  [{ cmd: "strikeThrough", icon: <Strikethrough />, label: "Strikethrough" }],
];

/**
 * Lightweight rich-text body editor (contentEditable + execCommand) with the
 * toolbar from the Figma. Emits HTML; the backend sends it as the email's HTML
 * part and derives a plain-text part from it.
 */
export function RichTextEditor({ onChange, placeholder = "Type Your Reply..." }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const exec = (c: Cmd) => {
    ref.current?.focus();
    document.execCommand(c.cmd, false, c.arg);
    emit();
  };
  const emit = () => {
    const el = ref.current;
    if (!el) return;
    // Treat "<br>" / empty paragraphs as empty so validation and the placeholder work
    const html = el.innerText.trim() ? el.innerHTML : "";
    if (!html && el.innerHTML) el.innerHTML = "";
    onChange(html);
  };

  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        aria-label="Email body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        className="rte px-1 pb-3 text-[13px] leading-relaxed text-ink-900 outline-none"
      />
      <div className="flex flex-wrap items-center gap-0.5 rounded-full bg-white px-2 py-1 shadow-[0_0_0_1px_rgba(0,0,0,0.03)]" role="toolbar" aria-label="Formatting">
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5 border-ink-200 pr-1 [&:not(:last-child)]:mr-1 [&:not(:last-child)]:border-r">
            {group.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                aria-label={c.label}
                onMouseDown={(e) => e.preventDefault()} // keep the selection in the editor
                onClick={() => exec(c)}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900 [&>svg]:h-4 [&>svg]:w-4"
              >
                {c.icon}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="min-h-[260px] cursor-text" onClick={() => ref.current?.focus()} />
    </div>
  );
}
