import type { ReactNode } from "react";

export function BillingField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid min-w-0 content-start gap-1.5 text-sm font-medium text-[var(--ink-soft)] ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
