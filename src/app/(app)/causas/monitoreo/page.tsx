"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { labelSemaforo, type Semaforo } from "@/lib/pjud/classify";
import {
  labelCausaOrigen,
  labelPjudSyncStatus,
} from "@/lib/pjud/causa-origin";
import { PjudQuickAddPanel } from "@/components/pjud/PjudQuickAddPanel";
import { apiMutation } from "@/lib/api-mutation";

type Item = {
  id: string;
  titulo: string;
  rit: string | null;
  tribunal: string;
  sala: string | null;
  proximaTabla?: string | null;
  proximaTablaNota?: string | null;
  materia: string;
  etapa: string;
  abogado: { id: string; name: string } | null;
  cliente: { id: string; razonSocial: string } | null;
  monitoreoActivo: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncNote: string | null;
  failCount: number;
  failed: boolean;
  pjudFromMisCausas?: boolean;
  pjudSource?: string | null;
  pjudOrigin?: string | null;
  movimientosCount: number;
  lastMovimiento: {
    titulo: string;
    fecha: string;
    tipo: string;
    fuente: string;
    cuaderno?: string | null;
  } | null;
  diasSinMovimiento: number | null;
  semaforo: Semaforo;
};

type Fallido = {
  jobId: string;
  causaId: string;
  rit: string | null;
  titulo: string;
  tribunal: string;
  lastError: string | null;
  failCount: number;
  createdAt: string;
};

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-rose-500",
  gris: "bg-slate-300",
};

function fmtShort(value: string | null) {
  if (!value) return "nunca";
  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function MonitoreoCausasPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fallidos, setFallidos] = useState<Fallido[]>([]);
  const [resumen, setResumen] = useState<Record<string, number> | null>(null);
  const [filter, setFilter] = useState<
    "todas" | Semaforo | "monitoreadas" | "fallidas"
  >("monitoreadas");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/causas/monitoreo");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
    setFallidos(data.fallidos || []);
    setResumen(data.resumen || null);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/causas/monitoreo")
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el monitoreo");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setFallidos(data.fallidos || []);
        setResumen(data.resumen || null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase(); // ⚡ Bolt: compute toLowerCase() outside the loop to optimize list filtering
    return items.filter((i) => {
      if (filter === "monitoreadas" && !i.monitoreoActivo) return false;
      if (filter === "fallidas" && !i.failed) return false;
      if (
        filter !== "todas" &&
        filter !== "monitoreadas" &&
        filter !== "fallidas" &&
        i.semaforo !== filter
      )
        return false;
      if (!query) return true;
      const hay = `${i.rit} ${i.titulo} ${i.tribunal} ${i.sala || ""} ${i.cliente?.razonSocial || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [items, filter, q]);

  async function syncAll() {
    setBusy(true);
    setMsg("");
    // Pasar IDs monitoreados para no limitar a pjudNextSyncAt vencido (botón = todas las monitoreadas).
    const monitoredIds = items.filter((i) => i.monitoreoActivo).map((i) => i.id);
    const result = await apiMutation<{
      synced?: number;
      results?: Array<{ inserted?: number }>;
    }>("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync",
        ...(monitoredIds.length ? { causaIds: monitoredIds } : {}),
      }),
    });
    setBusy(false);
    setMsg(
      result.ok
        ? `Sync cartera: ${result.data.synced} causas · +${(result.data.results || []).reduce((s, r) => s + (r.inserted || 0), 0)} movimientos`
        : result.error || "Error"
    );
    await load();
  }

  async function retryFallidos() {
    setBusy(true);
    setMsg("");
    const result = await apiMutation<{ synced?: number }>("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-fallidos" }),
    });
    setBusy(false);
    setMsg(
      result.ok
        ? `Reintento fallidos: ${result.data.synced} causas`
        : result.error || "Error"
    );
    await load();
  }

  async function clearFallidosAvisos() {
    setBusy(true);
    setMsg("");
    const result = await apiMutation<{
      clearedCausas?: number;
      dismissedJobs?: number;
    }>("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-errors" }),
    });
    setBusy(false);
    setMsg(
      result.ok
        ? `Avisos limpiados: ${result.data.clearedCausas || 0} causa(s) · ${result.data.dismissedJobs || 0} job(s)`
        : result.error || "Error al limpiar avisos"
    );
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartera PJUD"
        subtitle={<>Esta vista es el pulso judicial (semáforo, sync, CSV). El expediente se edita en <Link href="/causas" className="text-[var(--sea)] hover:underline">Expediente</Link>. ClaveÚnica se configura en su pestaña, no aquí.</>}
        actions={
          <>
          <Link
            className="btn btn-secondary"
            href="/api/causas/monitoreo?format=csv"
            prefetch={false}
          >
            Exportar CSV
          </Link>
          <label className="btn btn-secondary cursor-pointer">
            Importar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setMsg("");
                const csv = await file.text();
                const result = await apiMutation<{
                  imported?: number;
                  created?: number;
                }>("/api/causas/monitoreo", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "import-cartera",
                    csv,
                    syncNow: false,
                  }),
                });
                setBusy(false);
                setMsg(
                  result.ok
                    ? `CSV cartera: ${result.data.imported} filas · ${result.data.created} nuevas (sync diferido)`
                    : result.error || "Error al importar CSV"
                );
                await load();
              }}
            />
          </label>
          {fallidos.length > 0 && (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy}
              onClick={retryFallidos}
            >
              Reintentar fallidos
            </button>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={syncAll}
          >
            {busy ? "Sincronizando…" : "Sincronizar monitoreadas"}
          </button>
          </>
        }
      />

      {msg && (
        <div className="flex flex-wrap items-start justify-between gap-2 text-sm text-[var(--ink-soft)]/80">
          <p className="min-w-0 flex-1">{msg}</p>
          <button
            type="button"
            className="shrink-0 text-xs underline-offset-2 hover:underline"
            onClick={() => setMsg("")}
          >
            Cerrar
          </button>
        </div>
      )}

      <PjudQuickAddPanel />

      {resumen && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 border-y border-[var(--line)] py-5 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Cartera", value: resumen.total },
            { label: "Monitoreadas", value: resumen.monitoreadas },
            { label: "Al día", value: resumen.verdes },
            { label: "Atenuar", value: resumen.amarillas },
            { label: "Críticas", value: resumen.rojas },
            { label: "Fallidas", value: resumen.fallidas },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-[var(--muted)]">
                {s.label}
              </dt>
              <dd className="display mt-2 text-3xl tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {fallidos.length > 0 && (
        <section className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-rose-800">
              Fallidos ({fallidos.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost text-xs"
                disabled={busy}
                onClick={clearFallidosAvisos}
                title="Quita avisos y contadores sin volver a sincronizar"
              >
                Limpiar avisos
              </button>
            </div>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {fallidos.slice(0, 8).map((f) => (
              <li
                key={f.jobId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-2"
              >
                <div>
                  <Link
                    href={`/causas/${f.causaId}?from=monitoreo`}
                    className="font-medium text-[var(--sea)]"
                  >
                    {f.rit || f.titulo}
                  </Link>
                  <div className="text-xs text-rose-800/80">
                    {f.lastError || "Error de sync"} ·×{f.failCount || 1}
                  </div>
                </div>
                <span className="text-xs text-rose-700/70">
                  {fmtShort(f.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(resumen?.fallidas ?? 0) > 0 && fallidos.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          <p>
            Hay {resumen?.fallidas} causa(s) con fallo de sync marcado. Puede
            limpiar los avisos sin reintentar.
          </p>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={busy}
            onClick={clearFallidosAvisos}
          >
            Limpiar avisos
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todas", "Todas"],
              ["monitoreadas", "Monitoreadas"],
              ["fallidas", "Fallidas"],
              ["verde", "Al día"],
              ["amarillo", "Amarillas"],
              ["rojo", "Rojas"],
              ["gris", "Sin datos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium transition-colors ${
                filter === key
                  ? "border-[var(--sea)] bg-[var(--sea)]/10 text-[var(--ink)]"
                  : "border-[var(--line)] text-[var(--muted)]"
              }`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block w-full space-y-2 text-sm font-medium sm:ml-auto sm:max-w-sm">
          <span>Buscar causa</span>
        <input
          className="input"
          placeholder="Buscar RIT, título, sala, cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        </label>
      </div>

      <div className="panel overflow-x-auto rounded-[var(--radius-lg)]">
        <table role="table" className="data-table min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-sm text-[var(--muted)]">
            <tr role="row">
              <th role="columnheader" scope="col" className="px-4 py-3">Actividad PJUD</th>
              <th role="columnheader" scope="col" className="px-4 py-3">Causa</th>
              <th role="columnheader" scope="col" className="px-4 py-3">Tribunal / Sala</th>
              <th role="columnheader" scope="col" className="px-4 py-3">Último movimiento</th>
              <th role="columnheader" scope="col" className="px-4 py-3">Días</th>
              <th role="columnheader" scope="col" className="px-4 py-3">Sync</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const origen = labelCausaOrigen({
                pjudOrigin: i.pjudOrigin,
                pjudFromMisCausas: i.pjudFromMisCausas,
                pjudSource: i.pjudSource,
              });
              return (
              <tr role="row" key={i.id} className="border-b border-[var(--line)]/70">
                <td role="cell" data-label="Actividad PJUD" className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${DOT[i.semaforo]}`}
                    />
                    {labelSemaforo(i.semaforo)}
                    {i.failed && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs uppercase tracking-wide text-rose-700">
                        fallido
                      </span>
                    )}
                  </span>
                </td>
                <td role="cell" data-label="Causa" className="data-table-primary px-4 py-3">
                  <Link
                    href={`/causas/${i.id}?from=monitoreo`}
                    className="font-medium text-[var(--sea)]"
                  >
                    {i.rit || i.titulo}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">
                    {i.cliente?.razonSocial || "—"} ·{" "}
                    {i.abogado?.name || "Sin abogado"}
                    {i.monitoreoActivo ? " · ON" : ""}
                    {origen ? ` · ${origen}` : ""}
                  </div>
                </td>
                <td role="cell" data-label="Tribunal / Sala" className="px-4 py-3 text-[var(--ink-soft)]/80">
                  <div>{i.tribunal}</div>
                  {i.sala && (
                    <div className="text-xs text-[var(--muted)]">
                      Sala {i.sala}
                    </div>
                  )}
                  {i.proximaTabla && (
                    <div className="text-xs text-[var(--copper)]">
                      Tabla{" "}
                      {new Date(i.proximaTabla).toLocaleDateString("es-CL")}
                      {i.proximaTablaNota
                        ? ` · ${i.proximaTablaNota.replace(/^En tabla:\s*/, "")}`
                        : ""}
                    </div>
                  )}
                </td>
                <td role="cell" data-label="Último movimiento" className="px-4 py-3">
                  {i.lastMovimiento ? (
                    <>
                      <div className="max-w-xs break-words">
                        {i.lastMovimiento.titulo}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {new Date(i.lastMovimiento.fecha).toLocaleDateString(
                          "es-CL"
                        )}{" "}
                        · {i.lastMovimiento.fuente}
                        {i.lastMovimiento.cuaderno
                          ? ` · ${i.lastMovimiento.cuaderno}`
                          : ""}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td role="cell" data-label="Días" className="px-4 py-3">
                  {i.diasSinMovimiento === null
                    ? "—"
                    : `${i.diasSinMovimiento}d`}
                </td>
                <td role="cell" data-label="Sync" className="px-4 py-3 text-xs text-[var(--muted)]">
                  <div>
                    Último: {fmtShort(i.lastSyncAt)}
                    {i.lastSyncStatus
                      ? ` · ${labelPjudSyncStatus(i.lastSyncStatus)}`
                      : ""}
                  </div>
                  <div>Próximo: {fmtShort(i.nextSyncAt)}</div>
                  {i.lastSyncNote && (
                    <div
                      className="mt-1 max-w-[18rem] break-words text-[var(--copper-deep)]"
                      title={i.lastSyncNote}
                    >
                      {i.lastSyncNote}
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr role="row">
                <td role="cell"
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  No hay causas con este filtro.{" "}
                  {filter === "monitoreadas" ? (
                    <>
                      Active el monitoreo en{" "}
                      <Link href="/causas" className="text-[var(--sea)]">
                        Expediente
                      </Link>{" "}
                      o use alta por ROL. También puede conectar{" "}
                      <Link href="/causas/mis-causas" className="text-[var(--sea)]">
                        ClaveÚnica
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Pruebe «Monitoreadas» o abra{" "}
                      <Link href="/causas" className="text-[var(--sea)]">
                        Expediente
                      </Link>
                      .
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
