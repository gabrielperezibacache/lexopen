import type { PjudOpsLogEntry } from "@/lib/pjud/ops-log";

export function PjudOpsLogPanel({
  generatedAt,
  entries,
}: {
  generatedAt: string;
  entries: PjudOpsLogEntry[];
}) {
  if (!entries.length) {
    return (
      <section
        id="pjud-log"
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-soft)]/70"
        data-testid="pjud-ops-log"
      >
        <h3 className="font-semibold text-[var(--ink)]">Log PJUD</h3>
        <p className="mt-1">Sin avisos del Host en este momento.</p>
      </section>
    );
  }

  return (
    <div
      id="pjud-log"
      className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--brand-night)] p-4 text-sm text-white/90"
      data-testid="pjud-ops-log"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-white">Log PJUD</h3>
        <span className="text-xs text-white/75">
          {generatedAt ? new Date(generatedAt).toLocaleString("es-CL") : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-white/75">
        Avisos del Host (servicio auxiliar, CAPTCHA, canal). No se muestran en
        Causas para no ensuciar el expediente.
      </p>
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto font-mono text-xs leading-relaxed">
        {entries.map((entry, i) => (
          <li key={`${entry.source}-${entry.at}-${i}`} className="flex gap-2">
            <span
              className={
                entry.level === "error"
                  ? "shrink-0 text-rose-300"
                  : entry.level === "warn"
                    ? "shrink-0 text-amber-300"
                    : "shrink-0 text-emerald-300"
              }
            >
              {entry.level.toUpperCase()}
            </span>
            <span className="shrink-0 text-white/75">{entry.source}</span>
            <span className="min-w-0 break-words text-white/85">
              {entry.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
