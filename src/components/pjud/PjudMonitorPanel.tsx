"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { labelMovimientoTipo } from "@/lib/pjud/classify";

type Movimiento = {
  id: string;
  titulo: string;
  detalle: string | null;
  fuente: string;
  tipo: string;
  referencia: string | null;
  relevante: boolean;
  fecha: string | Date;
};

type Props = {
  causaId: string;
  monitoreoActivo: boolean;
  lastSyncAt: string | Date | null;
  lastSyncStatus: string | null;
  lastSyncNote: string | null;
  movimientos: Movimiento[];
  diasSinMovimiento: number | null;
  semaforo: "verde" | "amarillo" | "rojo" | "gris";
};

const SEM: Record<string, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-rose-500",
  gris: "bg-slate-300",
};

const SEM_LABEL: Record<string, string> = {
  verde: "Al día",
  amarillo: "Sin movimiento reciente",
  rojo: "Atención: inactiva",
  gris: "Sin datos",
};

function fmt(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-CL");
}

export function PjudMonitorPanel({
  causaId,
  monitoreoActivo,
  lastSyncAt,
  lastSyncStatus,
  lastSyncNote,
  movimientos,
  diasSinMovimiento,
  semaforo,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function action(act: "sync" | "enable" | "disable") {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/causas/${causaId}/pjud`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Error");
      return;
    }
    if (act === "sync") {
      setMsg(
        `${data.demo ? "[DEMO] " : ""}+${data.inserted || 0} nuevos · ${data.skipped || 0} ya conocidos. ${data.note || ""}`
      );
    } else {
      setMsg(act === "enable" ? "Monitoreo activado." : "Monitoreo desactivado.");
    }
    router.refresh();
  }

  return (
    <section className="panel space-y-5 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Seguimiento judicial (PJUD)</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-soft)]/75">
            Estilo CaseTracking: sincronice movimientos, clasifique proveídos /
            audiencias y reciba alertas. Sin scrapers ocultos — partner API o
            demo etiquetado / import CSV.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm">
          <span className={`h-3 w-3 rounded-full ${SEM[semaforo]}`} />
          <span>
            {SEM_LABEL[semaforo]}
            {diasSinMovimiento !== null ? ` · ${diasSinMovimiento}d` : ""}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]/70">
        <span className="rounded-full border border-[var(--line)] px-2 py-1">
          {monitoreoActivo ? "Monitoreo ON" : "Monitoreo OFF"}
        </span>
        <span className="rounded-full border border-[var(--line)] px-2 py-1">
          Último sync: {lastSyncAt ? fmt(lastSyncAt) : "nunca"}
          {lastSyncStatus ? ` · ${lastSyncStatus}` : ""}
        </span>
      </div>
      {lastSyncNote && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {lastSyncNote}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => action("sync")}
        >
          {busy ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        {monitoreoActivo ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => action("disable")}
          >
            Pausar monitoreo
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => action("enable")}
          >
            Activar monitoreo
          </button>
        )}
        <Link href="/causas/monitoreo" className="btn btn-ghost">
          Ver cartera
        </Link>
      </div>
      {msg && (
        <p className="rounded-2xl border border-[var(--line)] bg-white/80 px-3 py-2 text-xs text-[var(--ink-soft)]/80">
          {msg}
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
          Timeline de movimientos
        </h3>
        {movimientos.map((m) => (
          <article
            key={m.id}
            className={`rounded-2xl border px-3 py-2 text-sm ${
              m.relevante
                ? "border-[var(--copper)]/40 bg-[var(--copper)]/5"
                : "border-[var(--line)] bg-white/70"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{m.titulo}</div>
              <div className="flex flex-wrap gap-1">
                <span className="badge badge-ink">{labelMovimientoTipo(m.tipo)}</span>
                <span className="badge badge-ink">{m.fuente}</span>
                {m.relevante && <span className="badge badge-ink">relevante</span>}
              </div>
            </div>
            <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
              {fmt(m.fecha)}
              {m.referencia ? ` · Ref. ${m.referencia}` : ""}
            </div>
            {m.detalle && (
              <p className="mt-2 text-[var(--ink-soft)]/80">{m.detalle}</p>
            )}
          </article>
        ))}
        {movimientos.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            Sin movimientos. Sincronice o importe CSV desde la consulta oficial.
          </p>
        )}
      </div>
    </section>
  );
}
