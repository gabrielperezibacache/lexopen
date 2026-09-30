"use client";

import { Button } from "@/components/ui/Button";

/** Inline / boundary error panel — strings passed from i18n caller. */
export function ErrorState({
  eyebrow,
  title,
  description,
  retryLabel,
  onRetry,
}: {
  eyebrow: string;
  title: string;
  description: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel rounded-[var(--radius-xl)] p-6" role="alert">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--danger)]">
        {eyebrow}
      </p>
      <h1 className="display mt-2 text-2xl sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
      {onRetry ? (
        <Button variant="primary" className="mt-4" type="button" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
