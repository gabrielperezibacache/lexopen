"use client";

import { useMemo, useState } from "react";
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
  cuaderno?: string | null;
  folio?: string | null;
  etapa?: string | null;
  tramite?: string | null;
  esReceptor?: boolean;
  pendienteResolucion?: boolean;
  documentoRef?: string | null;
};

type Props = {
  causaId: string;
  monitoreoActivo: boolean;
  lastSyncAt: string | Date | null;
  nextSyncAt?: string | Date | null;
  lastSyncStatus: string | null;
  lastSyncNote: string | null;
  failCount?: number;
  sala?: string | null;
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

type Tab = "historial" | "cuadernos" | "receptor" | "escritos";

function fmt(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-CL");
}

function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function documentoHref(ref: string | null | undefined) {
  if (!ref) return null;
  if (ref.startsWith("doc:")) {
    const id = ref.slice(4).trim();
    return id ? `/api/documentos/${id}/content` : null;
  }
  if (ref.startsWith("lexopen:")) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  return null;
}

function MovementCard({ m }: { m: Movimiento }) {
  const docUrl = documentoHref(m.documentoRef);
  return (
    <article
      className={`rounded-2xl border px-3 py-2 text-sm ${
        m.relevante || m.esReceptor
          ? "border-[var(--copper)]/40 bg-[var(--copper)]/5"
          : "border-[var(--line)] bg-white/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{m.titulo}</div>
        <div className="flex flex-wrap gap-1">
          <span className="badge badge-ink">{labelMovimientoTipo(m.tipo)}</span>
          <span className="badge badge-ink">{m.fuente}</span>
          {m.cuaderno && <span className="badge badge-ink">{m.cuaderno}</span>}
          {m.esReceptor && <span className="badge badge-ink">receptor</span>}
          {m.pendienteResolucion && (
            <span className="badge badge-ink">por resolver</span>
          )}
          {m.relevante && <span className="badge badge-ink">relevante</span>}
        </div>
      </div>
      <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
        {fmt(m.fecha)}
        {m.folio ? ` · Folio ${m.folio}` : ""}
        {m.referencia ? ` · Ref. ${m.referencia}` : ""}
        {m.tramite ? ` · ${m.tramite}` : ""}
      </div>
      {m.detalle && (
        <p className="mt-2 text-[var(--ink-soft)]/80">{m.detalle}</p>
      )}
      {docUrl && (
        <p className="mt-1 text-xs">
          <a
            className="text-[var(--sea)] underline-offset-2 hover:underline"
            href={docUrl}
            target="_blank"
            rel="noreferrer"
          >
            {m.documentoRef?.startsWith("doc:")
              ? "Ver documento LexOpen"
              : "Ver documento (OJV)"}
          </a>
        </p>
      )}
      {!docUrl && m.documentoRef && (
        <p className="mt-1 text-xs text-[var(--ink-soft)]/55">
          Ref. doc: {m.documentoRef}
        </p>
      )}
    </article>
  );
}

export function PjudMonitorPanel({
  causaId,
  monitoreoActivo,
  lastSyncAt,
  nextSyncAt,
  lastSyncStatus,
  lastSyncNote,
  failCount = 0,
  sala,
  movimientos,
  diasSinMovimiento,
  semaforo,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<Tab>("historial");
  const [cuadernoFilter, setCuadernoFilter] = useState<string>("todos");

  const cuadernos = useMemo(() => {
    const set = new Set(
      movimientos.map((m) => m.cuaderno || "Principal").filter(Boolean)
    );
    return [...set].sort();
  }, [movimientos]);

  const receptor = useMemo(
    () => movimientos.filter((m) => m.esReceptor),
    [movimientos]
  );
  const escritos = useMemo(
    () =>
      movimientos.filter(
        (m) =>
          m.pendienteResolucion ||
          (m.tipo === "escrito" && (m.relevante || m.pendienteResolucion))
      ),
    [movimientos]
  );

  const visible = useMemo(() => {
    if (tab === "receptor") return receptor;
    if (tab === "escritos") return escritos;
    if (tab === "cuadernos" && cuadernoFilter !== "todos") {
      return movimientos.filter(
        (m) => (m.cuaderno || "Principal") === cuadernoFilter
      );
    }
    if (tab === "cuadernos") return movimientos;
    return movimientos;
  }, [tab, receptor, escritos, movimientos, cuadernoFilter]);

  async function action(act: "sync" | "enable" | "disable" | "retry") {
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
    if (act === "sync" || act === "retry") {
      setMsg(
        `${data.demo ? "[DEMO] " : ""}+${data.inserted || 0} nuevos · ${data.skipped || 0} ya conocidos · receptor ${data.receptorCount || 0}. ${data.note || ""}`
      );
    } else {
      setMsg(act === "enable" ? "Monitoreo activado." : "Monitoreo desactivado.");
    }
    router.refresh();
  }

  const failed =
    lastSyncStatus === "failed" ||
    lastSyncStatus === "error" ||
    failCount > 0;

  return (
    <section className="panel space-y-5 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Seguimiento judicial (PJUD)</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-soft)]/75">
            Experiencia tipo CausaMonitor: cuadernos, receptor, escritos, sync,
            fallidos, scrape OJV opt-in y Mis Causas vía ClaveÚnica cifrada.
            Ver /causas/mis-causas y docs/PJUD.md.
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
        {sala && (
          <span className="rounded-full border border-[var(--line)] px-2 py-1">
            Sala: {sala}
          </span>
        )}
        <span className="rounded-full border border-[var(--line)] px-2 py-1">
          Último sync: {fmtDateTime(lastSyncAt)}
          {lastSyncStatus ? ` · ${lastSyncStatus}` : ""}
        </span>
        <span className="rounded-full border border-[var(--line)] px-2 py-1">
          Próximo sync: {fmtDateTime(nextSyncAt)}
        </span>
        <span className="rounded-full border border-[var(--line)] px-2 py-1">
          {cuadernos.length} cuaderno(s) · {receptor.length} receptor ·{" "}
          {escritos.length} escrito(s)
        </span>
        {failed && (
          <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700">
            Fallido{failCount ? ` ×${failCount}` : ""}
          </span>
        )}
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
        {failed && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => action("retry")}
          >
            Reintentar fallido
          </button>
        )}
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

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["historial", `Historial (${movimientos.length})`],
            ["cuadernos", `Cuadernos (${cuadernos.length})`],
            ["receptor", `Receptor (${receptor.length})`],
            ["escritos", `Por resolver (${escritos.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${
              tab === key
                ? "border-[var(--sea)] bg-[var(--sea)]/10 text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--ink-soft)]/75"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cuadernos" && cuadernos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${
              cuadernoFilter === "todos"
                ? "border-[var(--sea)] bg-[var(--sea)]/10"
                : "border-[var(--line)]"
            }`}
            onClick={() => setCuadernoFilter("todos")}
          >
            Todos
          </button>
          {cuadernos.map((c) => (
            <button
              key={c}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${
                cuadernoFilter === c
                  ? "border-[var(--sea)] bg-[var(--sea)]/10"
                  : "border-[var(--line)]"
              }`}
              onClick={() => setCuadernoFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
          {tab === "receptor"
            ? "Notificaciones de receptor"
            : tab === "escritos"
              ? "Escritos por resolver"
              : tab === "cuadernos"
                ? "Movimientos por cuaderno"
                : "Timeline de movimientos"}
        </h3>
        {visible.map((m) => (
          <MovementCard key={m.id} m={m} />
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            {tab === "receptor"
              ? "Sin notificaciones de receptor. Sincronice o importe CSV con columna receptor=1."
              : tab === "escritos"
                ? "Sin escritos por resolver."
                : "Sin movimientos. Sincronice o importe CSV desde la consulta oficial."}
          </p>
        )}
      </div>
    </section>
  );
}
