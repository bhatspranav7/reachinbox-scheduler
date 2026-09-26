/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";

export function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  const initials = (name ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    <img src={src} alt={name ?? "avatar"} referrerPolicy="no-referrer" className={cn("h-7 w-7 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white", className)}>{initials}</div>
  );
}
