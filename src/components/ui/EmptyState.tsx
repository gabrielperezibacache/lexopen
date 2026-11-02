import Link from "next/link";
import type { ReactNode } from "react";
import { FolioSymbol } from "./FolioSymbol";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  action,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel empty-state px-6 py-10 text-center" role="status">
      <FolioSymbol variant="collection" className="mx-auto mb-4 h-12 w-12 text-[var(--sea)]" />
      <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{description}</p>
      {(action || (actionLabel && actionHref)) && (
        <div className="mt-5 flex justify-center">
          {action || (
            <Link href={actionHref!} className="btn btn-primary">
              {actionLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
