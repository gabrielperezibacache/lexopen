import type { ReactNode } from "react";

export function WorkspaceField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[var(--ink-soft)]"><span>{label}</span>{children}</label>;
}
