"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { formatDateTime } from "@/components/ui";
import { EventoForm, type EventoFormDefaults } from "@/components/calendario/EventoForm";

type Option = { id: string; label: string };

export type EventoListItem = {
  id: string;
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

function toDatetimeLocal(iso: string): string {
  // `datetime-local` espera hora local sin zona; usamos la del navegador.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function toFormDefaults(e: EventoListItem): EventoFormDefaults {
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: toDatetimeLocal(e.inicio),
    fin: e.fin ? toDatetimeLocal(e.fin) : "",
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
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(autoOpenNuevo);
  const [editing, setEditing] = useState<EventoListItem | null>(null);
  const [moving, setMoving] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  function onSaved() {
    closeForm();
    router.refresh();
  }

  async function moveDay(evento: EventoListItem) {
    const newDate = moving[evento.id];
    if (!newDate) return;
    setBusyId(evento.id);
    setError("");
    const original = new Date(evento.inicio);
    const [y, m, d] = newDate.split("-").map(Number);
    const moved = new Date(original);
    moved.setFullYear(y, m - 1, d);
    const result = await apiMutation<{ conflictWarning?: string | null }>(
      `/api/eventos/${evento.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inicio: moved.toISOString() }),
      }
    );
    setBusyId(null);
    if (!result.ok) {
      setError(result.error || "No se pudo mover el evento");
      return;
    }
    router.refresh();
  }

  async function removeEvento(evento: EventoListItem) {
    if (!window.confirm(`¿Eliminar "${evento.titulo}"?`)) return;
    setBusyId(evento.id);
    setError("");
    const result = await apiMutation(`/api/eventos/${evento.id}`, { method: "DELETE" });
    setBusyId(null);
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
            href={`/api/calendario/ics?desde=${currentYm}-01`}
          >
            Exportar .ics
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
          causas={causas}
          defaults={editing ? toFormDefaults(editing) : undefined}
          onSaved={onSaved}
          onCancel={closeForm}
        />
      )}

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="space-y-2">
        {eventos.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium break-words">
                {e.tipo === "audiencia" ? "Audiencia · " : ""}
                {e.titulo}
              </div>
              <div className="text-xs text-[var(--ink-soft)]/65">
                {formatDateTime(e.inicio)}
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
            <div className="flex flex-wrap items-center gap-2">
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
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(e)}>
                Editar
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId === e.id}
                onClick={() => void removeEvento(e)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {eventos.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            Sin eventos este mes. Cree uno arriba o pídaselo al asistente en{" "}
            <Link href="/inicio" className="text-[var(--sea)]">
              Inicio
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}
