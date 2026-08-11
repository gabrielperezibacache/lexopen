"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { labelSemaforo, type Semaforo } from "@/lib/pjud/classify";

type Item = {
  id: string;
  titulo: string;
  rit: string | null;
  tribunal: string;
  materia: string;
  etapa: string;
  abogado: { id: string; name: string } | null;
  cliente: { id: string; razonSocial: string } | null;
  monitoreoActivo: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  movimientosCount: number;
  lastMovimiento: {
    titulo: string;
    fecha: string;
    tipo: string;
    fuente: string;
  } | null;
  diasSinMovimiento: number | null;
  semaforo: Semaforo;
};

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-rose-500",
  gris: "bg-slate-300",
};

export default function MonitoreoCausasPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [resumen, setResumen] = useState<Record<string, number> | null>(null);
  const [provider, setProvider] = useState<{ honesty?: string; apiConfigured?: boolean } | null>(null);
  const [filter, setFilter] = useState<"todas" | Semaforo | "monitoreadas">("todas");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/causas/monitoreo");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
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
      if (filter !== "todas" && filter !== "monitoreadas" && i.semaforo !== filter)
        return false;
      if (!q.trim()) return true;
      const hay = `${i.rit} ${i.titulo} ${i.tribunal} ${i.cliente?.razonSocial || ""}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [items, filter, q]);

  async function syncAll() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/causas/monitoreo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Seguimiento judicial
          </p>
          <h1 className="display mt-2 text-4xl">Monitoreo de causas</h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Cartera con semáforos, último movimiento y sync PJUD — experiencia
            inspirada en CaseTracking, con conectores honestos.
          </p>
        </div>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={syncAll}>
          {busy ? "Sincronizando…" : "Sincronizar monitoreadas"}
        </button>
      </div>

      {provider?.honesty && (
        <p className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--copper)]">
          {provider.honesty}
        </p>
      )}
      {msg && <p className="text-sm text-[var(--ink-soft)]/80">{msg}</p>}

      {resumen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Cartera", value: resumen.total },
            { label: "Monitoreadas", value: resumen.monitoreadas },
            { label: "Al día", value: resumen.verdes },
            { label: "Atenuar", value: resumen.amarillas },
            { label: "Críticas", value: resumen.rojas },
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

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["todas", "Todas"],
            ["monitoreadas", "Monitoreadas"],
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
          placeholder="Buscar RIT, título, cliente…"
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
              <th className="px-4 py-3">Tribunal</th>
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
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[i.semaforo]}`} />
                    {labelSemaforo(i.semaforo)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/causas/${i.id}`} className="font-medium text-[var(--sea)]">
                    {i.rit || i.titulo}
                  </Link>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {i.cliente?.razonSocial || "—"} · {i.abogado?.name || "Sin abogado"}
                    {i.monitoreoActivo ? " · ON" : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--ink-soft)]/80">{i.tribunal}</td>
                <td className="px-4 py-3">
                  {i.lastMovimiento ? (
                    <>
                      <div className="max-w-xs truncate">{i.lastMovimiento.titulo}</div>
                      <div className="text-xs text-[var(--ink-soft)]/60">
                        {new Date(i.lastMovimiento.fecha).toLocaleDateString("es-CL")} ·{" "}
                        {i.lastMovimiento.fuente}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {i.diasSinMovimiento === null ? "—" : `${i.diasSinMovimiento}d`}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]/65">
                  {i.lastSyncAt
                    ? new Date(i.lastSyncAt).toLocaleDateString("es-CL")
                    : "nunca"}
                  {i.lastSyncStatus ? ` · ${i.lastSyncStatus}` : ""}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-soft)]/65">
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
