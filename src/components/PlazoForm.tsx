"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

export function PlazoForm({
  causas,
  responsables,
}: {
  causas: Option[];
  responsables: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fechaNotificacion, setFechaNotificacion] = useState("");
  const [diasPlazo, setDiasPlazo] = useState("");
  const [tipoComputo, setTipoComputo] = useState<"habiles" | "corridos">(
    "habiles"
  );
  const [fechaLimite, setFechaLimite] = useState("");
  const [estimate, setEstimate] = useState<{
    vencimiento?: string;
    urgencia?: string;
    diasRestantes?: number;
    disclaimer?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!fechaNotificacion || !diasPlazo || Number(diasPlazo) < 1) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estimate-plazo",
          desde: fechaNotificacion,
          dias: Number(diasPlazo),
          tipoComputo,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setEstimate(data);
        })
        .catch(() => {
          if (!cancelled) setEstimate({ error: "No se pudo estimar" });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fechaNotificacion, diasPlazo, tipoComputo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      titulo: String(fd.get("titulo") || ""),
      descripcion: String(fd.get("descripcion") || ""),
      fechaLimite: fechaLimite || null,
      fechaNotificacion: fechaNotificacion || null,
      diasPlazo: diasPlazo ? Number(diasPlazo) : null,
      tipoComputo,
      esFatal: fd.get("esFatal") === "on",
      tipo: String(fd.get("tipo") || "procesal"),
      causaId: String(fd.get("causaId") || "") || null,
      responsableId: String(fd.get("responsableId") || "") || null,
    };
    const res = await fetch("/api/plazos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear el plazo");
      return;
    }
    e.currentTarget.reset();
    setFechaNotificacion("");
    setDiasPlazo("");
    setTipoComputo("habiles");
    setFechaLimite("");
    setEstimate(null);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid gap-4 rounded-3xl p-5 lg:grid-cols-4"
    >
      <div className="lg:col-span-2">
        <label className="mb-1 block text-sm font-medium">Título</label>
        <input
          className="input"
          name="titulo"
          required
          placeholder="Ej. Contestar demanda"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Causa</label>
        <select className="select" name="causaId" defaultValue="">
          <option value="">Sin causa</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Responsable</label>
        <select className="select" name="responsableId" defaultValue="">
          <option value="">Yo / por asignar</option>
          {responsables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notificación</label>
        <input
          className="input"
          type="date"
          name="fechaNotificacion"
          value={fechaNotificacion}
          onChange={(e) => setFechaNotificacion(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Días plazo</label>
        <input
          className="input"
          type="number"
          min="1"
          name="diasPlazo"
          placeholder="5"
          value={diasPlazo}
          onChange={(e) => setDiasPlazo(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Cómputo</label>
        <select
          className="select"
          name="tipoComputo"
          value={tipoComputo}
          onChange={(e) =>
            setTipoComputo(
              e.target.value === "corridos" ? "corridos" : "habiles"
            )
          }
        >
          <option value="habiles">Hábiles</option>
          <option value="corridos">Corridos</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Fecha límite directa
        </label>
        <input
          className="input"
          type="date"
          name="fechaLimite"
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Tipo</label>
        <select className="select" name="tipo" defaultValue="procesal">
          <option value="procesal">Procesal</option>
          <option value="interno">Interno</option>
          <option value="audiencia">Audiencia</option>
        </select>
      </div>
      <label className="flex items-end gap-2 pb-3 text-sm">
        <input type="checkbox" name="esFatal" /> Fatal
      </label>
      <div className="lg:col-span-2">
        <label className="mb-1 block text-sm font-medium">Descripción</label>
        <input
          className="input"
          name="descripcion"
          placeholder="Notas del cómputo"
        />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Guardando..." : "Crear plazo"}
        </button>
      </div>
      {estimate && !estimate.error && estimate.vencimiento && (
        <div className="lg:col-span-4 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
          <p>
            Estimación LexOpen: <strong>{estimate.vencimiento}</strong> ·{" "}
            {estimate.urgencia} · {estimate.diasRestantes}d
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]/70">
            {estimate.disclaimer}
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={() => setFechaLimite(estimate.vencimiento || "")}
          >
            Usar esta fecha
          </button>
        </div>
      )}
      {estimate?.error && (
        <p className="text-sm text-[var(--danger)] lg:col-span-4">
          {estimate.error}
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--danger)] lg:col-span-4">{error}</p>
      )}
    </form>
  );
}
