"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { labelSemaforo, type Semaforo } from "@/lib/pjud/classify";
import { PjudQuickAddPanel } from "@/components/pjud/PjudQuickAddPanel";

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
  const [provider, setProvider] = useState<{
    honesty?: string;
    apiConfigured?: boolean;
    scraperSidecarConfigured?: boolean;
    publicScrapeReady?: boolean;
    claveUnicaScrapeEnabled?: boolean;
    liveIngestConfigured?: boolean;
    pdfBackupEnabled?: boolean;
    syncIntervalMinutes?: number;
    captchaConfigured?: boolean;
    captcha?: {
      provider?: string | null;
      freeTier?: boolean;
      keyPresent?: boolean;
      fallbacks?: string[];
      configError?: string | null;
      providers?: { id: string; label: string; freeTier: boolean; selected?: boolean }[];
    };
    sidecar?: {
      configured?: boolean;
      reachable?: boolean;
      scrapeReady?: boolean | null;
      captcha?: boolean | null;
      urlHost?: string | null;
      error?: string | null;
    };
  } | null>(null);
  const [filter, setFilter] = useState<
    "todas" | Semaforo | "monitoreadas" | "fallidas"
  >("todas");
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
    setProvider(data.provider || null);
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
        setProvider(data.provider || null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
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
      if (!q.trim()) return true;
      const hay = `${i.rit} ${i.titulo} ${i.tribunal} ${i.sala || ""} ${i.cliente?.razonSocial || ""}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [items, filter, q]);

  async function syncAll() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(
      res.ok
        ? `Sync cartera: ${data.synced} causas · +${(data.results || []).reduce((s: number, r: { inserted?: number }) => s + (r.inserted || 0), 0)} movimientos`
        : data.error || "Error"
    );
    await load();
  }

  async function retryFallidos() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-fallidos" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(
      res.ok
        ? `Reintento fallidos: ${data.synced} causas`
        : data.error || "Error"
    );
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Seguimiento judicial
          </p>
          <h1 className="display mt-2 text-4xl">Monitoreo de causas</h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Cartera en su host con semáforos, sync y cola — paridad de flujo
            CausaMonitor. Puede llamar OJV/CAPTCHA/partner; los datos y el vault
            quedan aquí (scrape / sidecar / ClaveÚnica / CSV).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* API download (not an App Router page navigation) */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-secondary" href="/api/causas/monitoreo?format=csv">
            Exportar CSV
          </a>
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
                const res = await fetch("/api/causas/monitoreo", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "import-cartera",
                    csv,
                    syncNow: false,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                setBusy(false);
                setMsg(
                  res.ok
                    ? `CSV cartera: ${data.imported} filas · ${data.created} nuevas (sync diferido)`
                    : data.error || "Error al importar CSV"
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
        </div>
      </div>

      {provider?.honesty && (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            provider.liveIngestConfigured
              ? "border-[var(--line)] bg-white/70 text-[var(--copper)]"
              : "border-rose-300/60 bg-rose-50 text-rose-900"
          }`}
        >
          {!provider.liveIngestConfigured && (
            <strong className="mr-1">Ingest live no listo (fail-closed).</strong>
          )}
          {provider.honesty}
          {provider.syncIntervalMinutes
            ? ` Intervalo: cada ${provider.syncIntervalMinutes} min.`
            : ""}
          {" · "}
          API {provider.apiConfigured ? "ON" : "OFF"} · Sidecar{" "}
          {provider.sidecar?.configured
            ? provider.sidecar.reachable
              ? `ON (${provider.sidecar.urlHost || "local"}${
                  provider.sidecar.scrapeReady ? ", ready" : ""
                })`
              : `DOWN${provider.sidecar.error ? `: ${provider.sidecar.error}` : ""}`
            : provider.scraperSidecarConfigured
              ? "ON"
              : "OFF"}{" "}
          · Scrape {provider.publicScrapeReady ? "ON" : "OFF"} · CAPTCHA{" "}
          {provider.captchaConfigured
            ? `${provider.captcha?.provider || "on"}${
                provider.captcha?.freeTier ? " free" : ""
              }${provider.captcha?.keyPresent ? "+key" : ""}${
                provider.captcha?.fallbacks?.length
                  ? ` → ${provider.captcha.fallbacks.join(",")}`
                  : ""
              }`
            : provider.captcha?.configError
              ? "misconfig"
              : "OFF"}{" "}
          · ClaveÚnica {provider.claveUnicaScrapeEnabled ? "ON" : "OFF"}
          {provider.pdfBackupEnabled ? " · PDF backup ON" : ""}
        </p>
      )}
      {provider?.captcha?.configError && (
        <p className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="mr-1">CAPTCHA:</strong>
          {provider.captcha.configError}
        </p>
      )}
      {msg && <p className="text-sm text-[var(--ink-soft)]/80">{msg}</p>}

      <PjudQuickAddPanel />

      {resumen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "Cartera", value: resumen.total },
            { label: "Monitoreadas", value: resumen.monitoreadas },
            { label: "Al día", value: resumen.verdes },
            { label: "Atenuar", value: resumen.amarillas },
            { label: "Críticas", value: resumen.rojas },
            { label: "Fallidas", value: resumen.fallidas },
          ].map((s) => (
            <div key={s.label} className="panel rounded-2xl px-4 py-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                {s.label}
              </div>
              <div className="display mt-1 text-3xl">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {fallidos.length > 0 && (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-rose-800">
            Fallidos ({fallidos.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {fallidos.slice(0, 8).map((f) => (
              <li
                key={f.jobId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 pb-2"
              >
                <div>
                  <Link
                    href={`/causas/${f.causaId}`}
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
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === key
                ? "border-[var(--sea)] bg-[var(--sea)]/10 text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--ink-soft)]/75"
            }`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <input
          className="input ml-auto max-w-xs"
          placeholder="Buscar RIT, título, sala, cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-3xl border border-[var(--line)] bg-white/60">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            <tr>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Causa</th>
              <th className="px-4 py-3">Tribunal / Sala</th>
              <th className="px-4 py-3">Último movimiento</th>
              <th className="px-4 py-3">Días</th>
              <th className="px-4 py-3">Sync</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-b border-[var(--line)]/70">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${DOT[i.semaforo]}`}
                    />
                    {labelSemaforo(i.semaforo)}
                    {i.failed && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-700">
                        fallido
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/causas/${i.id}`}
                    className="font-medium text-[var(--sea)]"
                  >
                    {i.rit || i.titulo}
                  </Link>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {i.cliente?.razonSocial || "—"} ·{" "}
                    {i.abogado?.name || "Sin abogado"}
                    {i.monitoreoActivo ? " · ON" : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]/80">
                  <div>{i.tribunal}</div>
                  {i.sala && (
                    <div className="text-xs text-[var(--ink-soft)]/60">
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
                <td className="px-4 py-3">
                  {i.lastMovimiento ? (
                    <>
                      <div className="max-w-xs truncate">
                        {i.lastMovimiento.titulo}
                      </div>
                      <div className="text-xs text-[var(--ink-soft)]/60">
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
                <td className="px-4 py-3">
                  {i.diasSinMovimiento === null
                    ? "—"
                    : `${i.diasSinMovimiento}d`}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]/65">
                  <div>
                    Último: {fmtShort(i.lastSyncAt)}
                    {i.lastSyncStatus ? ` · ${i.lastSyncStatus}` : ""}
                  </div>
                  <div>Próximo: {fmtShort(i.nextSyncAt)}</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--ink-soft)]/65"
                >
                  No hay causas con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
