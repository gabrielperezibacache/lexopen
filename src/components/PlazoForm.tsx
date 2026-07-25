"use client";

import { FormEvent, useState } from "react";
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const diasPlazo = String(fd.get("diasPlazo") || "");
    const payload = {
      titulo: String(fd.get("titulo") || ""),
      descripcion: String(fd.get("descripcion") || ""),
      fechaLimite: String(fd.get("fechaLimite") || "") || null,
      fechaNotificacion: String(fd.get("fechaNotificacion") || "") || null,
      diasPlazo: diasPlazo ? Number(diasPlazo) : null,
      tipoComputo: String(fd.get("tipoComputo") || "habiles"),
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
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-4 rounded-3xl p-5 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <label className="mb-1 block text-sm font-medium">Título</label>
        <input className="input" name="titulo" required placeholder="Ej. Contestar demanda" />
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
        <input className="input" type="date" name="fechaNotificacion" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Días plazo</label>
        <input className="input" type="number" min="1" name="diasPlazo" placeholder="5" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Cómputo</label>
        <select className="select" name="tipoComputo" defaultValue="habiles">
          <option value="habiles">Hábiles</option>
          <option value="corridos">Corridos</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Fecha límite directa</label>
        <input className="input" type="date" name="fechaLimite" />
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
        <input className="input" name="descripcion" placeholder="Notas del cómputo" />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Guardando..." : "Crear plazo"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)] lg:col-span-4">{error}</p>}
    </form>
  );
}
