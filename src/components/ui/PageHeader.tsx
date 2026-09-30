import type { ReactNode } from "react";
import { cn } from "@/lib/chile";
import { pageTitleClass } from "@/components/ui/typography";

/** Shared page header for app and module routes. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={cn(pageTitleClass, !eyebrow && "mt-0")}>{title}</h1>
        {subtitle ? (
          <div className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ModuleHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
    />
  );
}
