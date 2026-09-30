import Link from "next/link";
import type { ReactNode } from "react";

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
    <div className="panel rounded-[var(--radius-xl)] px-6 py-10 text-center" role="status">
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
