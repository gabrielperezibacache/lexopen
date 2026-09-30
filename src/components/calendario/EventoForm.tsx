"use client";

import { FormEvent, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Option = { id: string; label: string };

const TIPOS = [
  { value: "audiencia", label: "Audiencia" },
  { value: "reunion", label: "Reunión" },
  { value: "recordatorio", label: "Recordatorio" },
  { value: "vencimiento", label: "Vencimiento" },
  { value: "otro", label: "Otro" },
] as const;

const MODALIDADES = [
  { value: "", label: "Sin especificar" },
  { value: "presencial", label: "Presencial" },
  { value: "videollamada", label: "Videollamada" },
  { value: "telefonica", label: "Telefónica" },
  { value: "hibrida", label: "Híbrida" },
  { value: "tribunal", label: "Tribunal" },
] as const;

export type EventoFormDefaults = {
  id?: string;
  titulo?: string;
  tipo?: string;
  inicio?: string; // datetime-local value, e.g. 2026-10-05T10:00
  fin?: string;
  todoElDia?: boolean;
  lugar?: string;
  modalidad?: string;
  causaId?: string;
  notas?: string;
  tipoAudiencia?: string;
  tribunal?: string;
};

export function EventoForm({
  causas,
  defaults,
  onSaved,
  onCancel,
}: {
  causas: Option[];
  defaults?: EventoFormDefaults;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(defaults?.id);
  const [tipo, setTipo] = useState(defaults?.tipo || "reunion");
  const [todoElDia, setTodoElDia] = useState(Boolean(defaults?.todoElDia));
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setWarning("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      titulo: String(fd.get("titulo") || ""),
      tipo,
      inicio: String(fd.get("inicio") || ""),
      fin: String(fd.get("fin") || "") || null,
      todoElDia,
      lugar: String(fd.get("lugar") || "") || null,
      modalidad: String(fd.get("modalidad") || "") || null,
      notas: String(fd.get("notas") || "") || null,
      causaId: String(fd.get("causaId") || "") || null,
      ...(tipo === "audiencia"
        ? {
            tipoAudiencia: String(fd.get("tipoAudiencia") || "") || null,
            tribunal: String(fd.get("tribunal") || "") || null,
          }
        : {}),
    };
    const result = await apiMutation<{ conflictWarning?: string | null; error?: string }>(
      isEdit ? `/api/eventos/${defaults!.id}` : "/api/eventos",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo guardar el evento");
      return;
    }
    if (result.data.conflictWarning) setWarning(result.data.conflictWarning);
    onSaved?.();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium">Título</label>
        <input
          className="input"
          name="titulo"
          required
          defaultValue={defaults?.titulo || ""}
          placeholder="Ej. Audiencia de juicio"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Tipo</label>
        <select
          className="select"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Causa</label>
        <select className="select" name="causaId" defaultValue={defaults?.causaId || ""}>
          <option value="">Sin causa</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Inicio</label>
        <input
          className="input"
          type="datetime-local"
          name="inicio"
          required
          defaultValue={defaults?.inicio || ""}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Fin (opcional)</label>
        <input className="input" type="datetime-local" name="fin" defaultValue={defaults?.fin || ""} />
      </div>
      <label className="flex items-end gap-2 pb-3 text-sm">
        <input
          type="checkbox"
          checked={todoElDia}
          onChange={(e) => setTodoElDia(e.target.checked)}
        />{" "}
        Todo el día
      </label>
      <div>
        <label className="mb-1 block text-sm font-medium">Lugar</label>
        <input className="input" name="lugar" defaultValue={defaults?.lugar || ""} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Modalidad</label>
        <select className="select" name="modalidad" defaultValue={defaults?.modalidad || ""}>
          {MODALIDADES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {tipo === "audiencia" && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de audiencia</label>
            <input
              className="input"
              name="tipoAudiencia"
              placeholder="Ej. Preparatoria"
              defaultValue={defaults?.tipoAudiencia || ""}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tribunal</label>
            <input className="input" name="tribunal" defaultValue={defaults?.tribunal || ""} />
          </div>
        </>
      )}
      <div className="sm:col-span-2 lg:col-span-4">
        <label className="mb-1 block text-sm font-medium">Notas</label>
        <input className="input" name="notas" defaultValue={defaults?.notas || ""} />
      </div>
      {warning && (
        <p className="text-sm text-[var(--warn)] sm:col-span-2 lg:col-span-4">{warning}</p>
      )}
      {error && (
        <p className="text-sm text-[var(--danger)] sm:col-span-2 lg:col-span-4">{error}</p>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear evento"}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
