"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import { eventFormDates } from "@/lib/calendario/form-dates";

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
  expectedUpdatedAt?: string;
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
  onSaved?: (warning?: string | null) => void;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(defaults?.id);
  const fieldId = useId();
  const submission = useRef<{ key: string; payload: Record<string, unknown> } | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const [inicio, setInicio] = useState(defaults?.inicio || "");
  const [fin, setFin] = useState(defaults?.fin || "");
  const [tipo, setTipo] = useState(defaults?.tipo || "reunion");
  const [todoElDia, setTodoElDia] = useState(Boolean(defaults?.todoElDia));
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setWarning("");
    if (busy) return;
    if (!retryingSave || !submission.current) {
      const fd = new FormData(e.currentTarget);
      let dates;
      try { dates = eventFormDates(inicio, fin, todoElDia); }
      catch (error) { setError((error as Error).message); return; }
      const payload = {
        titulo: String(fd.get("titulo") || ""),
        tipo,
        ...dates,
        ...(isEdit && defaults?.expectedUpdatedAt ? { expectedUpdatedAt: defaults.expectedUpdatedAt } : {}),
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
      submission.current = { key: submission.current?.key || operationKey(), payload };
    }
    const attempt = submission.current;
    setBusy(true);
    const result = await apiMutation<{ id?: string; conflictWarning?: string | null; error?: string }>(
      isEdit ? `/api/eventos/${defaults!.id}` : "/api/eventos",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
        body: JSON.stringify(attempt.payload),
      }
    );
    setBusy(false);
    if (!result.ok) {
      const uncertain = retryingSave || result.status === 0 || result.status === 408 || result.status >= 500;
      setRetryingSave(uncertain);
      setError(uncertain ? "No se pudo confirmar el evento. Reintente el guardado para comprobarlo sin duplicarlo." : result.error || "No se pudo guardar el evento");
      return;
    }
    if (!result.data.id) { setRetryingSave(true); setError("El servidor no confirmó el evento. Reintente el guardado."); return; }
    if (result.data.conflictWarning) setWarning(result.data.conflictWarning);
    onSaved?.(result.data.conflictWarning);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <fieldset disabled={busy || retryingSave} className="contents">
      <legend className="sr-only">Datos del evento</legend>
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-titulo`} className="mb-1 block text-sm font-medium">Título</label>
        <input
          className="input"
          id={`${fieldId}-titulo`} name="titulo"
          required
          defaultValue={defaults?.titulo || ""}
          placeholder="Ej. Audiencia de juicio"
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-tipo`} className="mb-1 block text-sm font-medium">Tipo</label>
        <select id={`${fieldId}-tipo`}
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
        <label htmlFor={`${fieldId}-causaId`} className="mb-1 block text-sm font-medium">Causa</label>
        <select className="select" id={`${fieldId}-causaId`} name="causaId" defaultValue={defaults?.causaId || ""}>
          <option value="">Sin causa</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-inicio`} className="mb-1 block text-sm font-medium">Inicio</label>
        <input
          className="input"
          type={todoElDia ? "date" : "datetime-local"}
          id={`${fieldId}-inicio`} name="inicio"
          required
          value={inicio}
          onChange={event => setInicio(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-fin`} className="mb-1 block text-sm font-medium">{todoElDia ? "Último día (opcional)" : "Fin (opcional)"}</label>
        <input className="input" type={todoElDia ? "date" : "datetime-local"} id={`${fieldId}-fin`} name="fin" value={fin} onChange={event => setFin(event.target.value)} />
      </div>
      <label className="flex items-end gap-2 pb-3 text-sm">
        <input
          type="checkbox"
          checked={todoElDia}
          onChange={(e) => {
            const allDay = e.target.checked;
            setTodoElDia(allDay);
            setInicio(value => allDay ? value.slice(0, 10) : value && value.length === 10 ? `${value}T09:00` : value);
            setFin(value => allDay ? value.slice(0, 10) : value && value.length === 10 ? `${value}T10:00` : value);
          }}
        />{" "}
        Todo el día
      </label>
      <div>
        <label htmlFor={`${fieldId}-lugar`} className="mb-1 block text-sm font-medium">Lugar</label>
        <input className="input" id={`${fieldId}-lugar`} name="lugar" defaultValue={defaults?.lugar || ""} />
      </div>
      <div>
        <label htmlFor={`${fieldId}-modalidad`} className="mb-1 block text-sm font-medium">Modalidad</label>
        <select className="select" id={`${fieldId}-modalidad`} name="modalidad" defaultValue={defaults?.modalidad || ""}>
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
            <label htmlFor={`${fieldId}-tipoAudiencia`} className="mb-1 block text-sm font-medium">Tipo de audiencia</label>
            <input
              className="input"
              id={`${fieldId}-tipoAudiencia`} name="tipoAudiencia"
              placeholder="Ej. Preparatoria"
              defaultValue={defaults?.tipoAudiencia || ""}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-tribunal`} className="mb-1 block text-sm font-medium">Tribunal</label>
            <input className="input" id={`${fieldId}-tribunal`} name="tribunal" defaultValue={defaults?.tribunal || ""} />
          </div>
        </>
      )}
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor={`${fieldId}-notas`} className="mb-1 block text-sm font-medium">Notas</label>
        <input className="input" id={`${fieldId}-notas`} name="notas" defaultValue={defaults?.notas || ""} />
      </div>
      </fieldset>
      {warning && (
        <p className="text-sm text-[var(--warn)] sm:col-span-2 lg:col-span-4">{warning}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)] sm:col-span-2 lg:col-span-4">{error}</p>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando…" : retryingSave ? "Reintentar guardado" : isEdit ? "Guardar cambios" : "Crear evento"}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" type="button" disabled={busy || retryingSave} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
