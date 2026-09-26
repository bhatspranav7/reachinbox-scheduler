import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "filled" | "line" | "box";

const variants: Record<Variant, string> = {
  // grey filled field (login screen)
  filled: "w-full h-11 rounded-lg bg-ink-100 px-4 placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500/30",
  // borderless field on a bottom rule (compose: To / Subject)
  line: "w-full h-9 bg-transparent px-0 placeholder:text-ink-400",
  // small outlined number box (compose: delay / hourly limit)
  box: "h-8 w-16 rounded-md border border-ink-200 px-2 text-center placeholder:text-ink-300 focus:border-brand-500",
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { variant?: Variant }>(function Input(
  { variant = "filled", className, ...p },
  ref,
) {
  return <input ref={ref} className={cn("text-sm text-ink-900 outline-none", variants[variant], className)} {...p} />;
});
