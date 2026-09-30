import { Skeleton } from "@/components/ui/Skeleton";

/** Shared loading panel for route segments and inline placeholders. */
export function LoadingState({
  label,
  lines = 3,
}: {
  label: string;
  lines?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel space-y-3 rounded-[var(--radius-xl)] p-6"
    >
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-5 w-2/3" : "h-4 w-full"} />
      ))}
    </div>
  );
}
