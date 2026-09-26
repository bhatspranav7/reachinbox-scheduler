"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

/** Anchored panel that closes on outside click / Escape (dropdowns, Send Later, filters). */
export function Popover({ open, onClose, trigger, children, align = "right", className }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div role="dialog" className={cn("absolute top-full z-40 mt-2 rounded-lg border border-ink-200 bg-white shadow-pop", align === "right" ? "right-0" : "left-0", className)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, active, danger }: { children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-100",
        active ? "font-medium text-brand-700" : danger ? "text-red-600" : "text-ink-700",
      )}
    >
      {children}
    </button>
  );
}
