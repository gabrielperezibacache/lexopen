import Link from "next/link";
import { ReactNode } from "react";

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
    <div className="panel rounded-3xl px-6 py-10 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-soft)]/75">{description}</p>
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
