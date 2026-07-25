"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel rounded-3xl p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--danger)]">
        Error
      </p>
      <h1 className="display mt-2 text-3xl">No se pudo cargar esta vista</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]/75">{error.message}</p>
      <button className="btn btn-primary mt-4" type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
