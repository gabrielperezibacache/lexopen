import type { ReactNode } from "react";
import { pageTitleClass } from "@/components/ui/typography";
import { EditorialHeading, type EditorialArtwork } from "./EditorialHeading";

/** Shared page header for app and module routes. */
export function PageHeader({
  title,
  subtitle,
  actions,
  artwork,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  artwork?: EditorialArtwork;
}) {
  const heading = (
    <div className="min-w-0">
      <h1 className={pageTitleClass}>{title}</h1>
      {subtitle ? (
        <div className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
  return (
    <div className="page-header mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      {artwork ? <EditorialHeading artwork={artwork}>{heading}</EditorialHeading> : heading}
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
  artwork,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  artwork?: EditorialArtwork;
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
      artwork={artwork}
    />
  );
}
