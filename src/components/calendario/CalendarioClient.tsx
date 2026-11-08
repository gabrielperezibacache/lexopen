"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys, operationKey } from "@/lib/client-submission-key";
import { moveEventToDay, toDatetimeLocal } from "@/lib/calendario/form-dates";
import { addCivilDays, civilMonthQueryRange, formatCivilDate } from "@/lib/chile-time";
import { ConfirmDialog, formatDateTime } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { EventoForm, type EventoFormDefaults } from "@/components/calendario/EventoForm";

import { useHydrated } from "./useHydrated";

type Option = { id: string; label: string };

export type EventoListItem = {
  id: string;
  updatedAt?: string;
  titulo: string;
  tipo: string;
  inicio: string; // ISO
  fin: string | null;
  todoElDia: boolean;
  lugar: string | null;
  modalidad: string | null;
  notas: string | null;
  causaId: string | null;
  causaLabel: string | null;
  tipoAudiencia: string | null;
  tribunal: string | null;
};

function toFormDefaults(e: EventoListItem): EventoFormDefaults {
  const firstDay = e.inicio.slice(0, 10);
  const lastDay = e.fin && e.todoElDia ? addCivilDays(e.fin.slice(0, 10), -1) : null;
  return {
    id: e.id,
    expectedUpdatedAt: e.updatedAt,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: e.todoElDia ? firstDay : toDatetimeLocal(e.inicio),
    fin: e.todoElDia ? lastDay ? lastDay < firstDay ? firstDay : lastDay : "" : e.fin ? toDatetimeLocal(e.fin) : "",
    todoElDia: e.todoElDia,
    lugar: e.lugar || "",
    modalidad: e.modalidad || "",
    causaId: e.causaId || "",
    notas: e.notas || "",
    tipoAudiencia: e.tipoAudiencia || "",
    tribunal: e.tribunal || "",
  };
}

/** Panel interactivo de eventos: crear/editar/mover de día/eliminar + export ICS. */
export function CalendarioClient({
  eventos,
  causas,
  autoOpenNuevo,
  currentYm,
}: {
  eventos: EventoListItem[];
  causas: Option[];
  autoOpenNuevo: boolean;
  currentYm: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { dict, t } = useI18n();
  const [formOpen, setFormOpen] = useState(autoOpenNuevo);
  const [editing, setEditing] = useState<EventoListItem | null>(null);
  const [moving, setMoving] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const moveKeys = useRef(createSubmissionKeys());
  const deleteKeys = useRef<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<EventoListItem | null>(null);
  const [year, month] = currentYm.split("-").map(Number);
  const exportRange = civilMonthQueryRange(year, month - 1);
  const exportQuery = new URLSearchParams({ desde: exportRange.start.toISOString(), hasta: exportRange.end.toISOString() });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(evento: EventoListItem) {
    setEditing(evento);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function onSaved(conflictWarning?: string | null) {
    setWarning(conflictWarning || "");
    closeForm();
    router.refresh();
  }

  async function moveDay(evento: EventoListItem) {
    const newDate = moving[evento.id];
    if (!newDate) return;
    setBusyId(evento.id);
    setError("");
    const moved = moveEventToDay(evento.inicio, newDate, evento.todoElDia);
    if (!moved) { setBusyId(null); setError("Revise el día y la hora del evento"); return; }
    const payload = { inicio: moved, expectedUpdatedAt: evento.updatedAt };
    const result = await apiMutation<{ conflictWarning?: string | null }>(
      `/api/eventos/${evento.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": moveKeys.current.forPayload({ id: evento.id, ...payload }) },
        body: JSON.stringify(payload),
      }
    );
    setBusyId(null);
    if (!result.ok) {
      setError(result.error || "No se pudo mover el evento");
      return;
    }
    moveKeys.current.complete({ id: evento.id, ...payload });
    setWarning(result.data.conflictWarning || "");
    router.refresh();
  }

  async function confirmRemoveEvento() {
    if (!pendingDelete) return;
    const evento = pendingDelete;
    setBusyId(evento.id);
    setError("");
    const result = await apiMutation(`/api/eventos/${evento.id}`, { method: "DELETE", headers: { "Idempotency-Key": deleteKeys.current[evento.id] ||= operationKey() } });
    setBusyId(null);
    setPendingDelete(null);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar el evento");
      return;
    }
    router.refresh();
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Eventos y audiencias</h2>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn btn-ghost"
            href={`/api/calendario/ics?${exportQuery}`}
          >
            Exportar calendario
          </a>
          {!formOpen && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Nuevo evento
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <EventoForm
          key={editing?.id || "create"}
          causas={causas}
          defaults={editing ? toFormDefaults(editing) : undefined}
          onSaved={onSaved}
          onCancel={closeForm}
        />
      )}

      {warning && <p role="status" className="text-sm text-[var(--warn)]">{warning}</p>}
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="space-y-2">
        {eventos.map((e) => (
          <div
            key={e.id}
            role="group"
            aria-label={`Evento ${e.titulo}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <button type="button" className="min-h-11 break-words text-left font-medium text-[var(--sea)]" disabled={busyId === e.id} aria-label={`Editar ${e.titulo}`} onClick={() => openEdit(e)}>
                {e.tipo === "audiencia" ? "Audiencia · " : ""}{e.titulo}
              </button>
              <div className="text-xs text-[var(--ink-soft)]/65">
                {e.todoElDia ? `${formatCivilDate(e.inicio)} · Todo el día` : hydrated ? formatDateTime(e.inicio) : <time dateTime={e.inicio}>…</time>}
                {e.causaLabel ? (
                  <>
                    {" · "}
                    <Link href={`/causas/${e.causaId}`} className="text-[var(--sea)]">
                      {e.causaLabel}
                    </Link>
                  </>
                ) : (
                  ""
                )}
              </div>
            </div>
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)]">Opciones</summary>
              <div className="flex flex-wrap items-center gap-2 py-2">
              <Link className="btn btn-ghost" href={`/offline.html?kind=evento&record=${encodeURIComponent(e.id)}`}>Preparar sin conexión</Link>
              <input
                type="date"
                className="input h-9 w-auto py-1 text-xs"
                aria-label={`Mover ${e.titulo} a otro día`}
                value={moving[e.id] || ""}
                onChange={(ev) => setMoving((prev) => ({ ...prev, [e.id]: ev.target.value }))}
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId === e.id || !moving[e.id]}
                onClick={() => void moveDay(e)}
              >
                Mover
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId === e.id}
                onClick={() => setPendingDelete(e)}
              >
                {t("common.delete")}
              </button>
              </div>
            </details>
          </div>
        ))}
        {eventos.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            Sin eventos este mes. Puedes pedirle uno a ALTAZOR en{" "}
            <Link href="/inicio" className="text-[var(--sea)]">
              Inicio
            </Link>
            .
          </p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmRemoveEvento()}
        title={
          pendingDelete
            ? dict.confirm.deleteEvent.replace("{title}", pendingDelete.titulo)
            : dict.confirm.deleteEvent
        }
        description={dict.confirm.deleteEventDesc}
        busy={Boolean(pendingDelete && busyId === pendingDelete.id)}
      />
    </section>
  );
}
