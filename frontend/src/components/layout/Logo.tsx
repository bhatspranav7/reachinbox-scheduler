export function Logo({ className = "text-[26px]" }: { className?: string }) {
  return <span className={`font-logo font-bold leading-none tracking-tight text-ink-900 ${className}`}>ONB</span>;
}
