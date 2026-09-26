import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Square icon-only button with an accessible label + tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton({ label, active, className, children, type = "button", ...p }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active && "text-brand-600",
        className,
      )}
      {...p}
    >
      {children}
    </button>
  );
});
