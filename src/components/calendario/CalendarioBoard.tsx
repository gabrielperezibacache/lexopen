"use client";

import { DragEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { moveEventToDay } from "@/lib/calendario/form-dates";
import { clasificarUrgencia } from "@/lib/plazos";

export type BoardEvento = {
  id: string;
  titulo: string;
  tipo: string;
  inicio: string;
  causaId: string | null;
  teachingHref?: string;
  todoElDia?: boolean;
  updatedAt?: string;
};

export type BoardPlazo = {
  id: string;
  titulo: string;
  causaId: string | null;
  esFatal: boolean;
  fechaLimite: string;
};

export type BoardTarea = {
  id: string;
  title: string;
  siteId: string | null;
};

export type BoardAudiencia = {
  id: string;
  titulo: string;
  causaId: string;
};

export type BoardDay = {
  ymd: string | null;
  p: BoardPlazo[];
  t: BoardTarea[];
  a: BoardAudiencia[];
  ev: BoardEvento[];
};

/** Rejilla mes/semana con drag-and-drop de eventos a otro día. */
export function CalendarioBoard({
  mode,
  days,
  todayKey,
  weekLabels,
}: {
  mode: "mes" | "semana";
  days: BoardDay[];
  todayKey: string;
  /** Etiquetas de cabecera Lun…Dom (solo semana/mes). */
  weekLabels: string[];
}) {
  const router = useRouter();
  const submission = useRef(createSubmissionKeys());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragOverYmd, setDragOverYmd] = useState<string | null>(null);

  function onDragStart(e: DragEvent, evento: BoardEvento) {
    e.dataTransfer.setData(
      "application/x-lexopen-evento",
      JSON.stringify({ id: evento.id, inicio: evento.inicio, todoElDia: evento.todoElDia, updatedAt: evento.updatedAt })
    );
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: DragEvent, ymd: string | null) {
    if (!ymd) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverYmd(ymd);
  }

  function onDragLeave(ymd: string | null) {
    if (dragOverYmd === ymd) setDragOverYmd(null);
  }

  async function onDrop(e: DragEvent, ymd: string | null) {
    e.preventDefault();
    setDragOverYmd(null);
    if (!ymd) return;
    const raw = e.dataTransfer.getData("application/x-lexopen-evento");
    if (!raw) return;
    let payload: { id: string; inicio: string; todoElDia?: boolean; updatedAt?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(payload.id) || typeof payload.inicio !== "string") return;
    const inicio = moveEventToDay(payload.inicio, ymd, payload.todoElDia === true);
    if (!inicio) { setError("Revise el día y la hora del evento"); return; }
    const body = { inicio, expectedUpdatedAt: payload.updatedAt };
    setBusyId(payload.id);
    setError("");
    const result = await apiMutation(`/api/eventos/${payload.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.forPayload({ id: payload.id, ...body }) },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error || "No se pudo mover el evento");
      return;
    }
    submission.current.complete({ id: payload.id, ...body });
    router.refresh();
  }

  const cols = mode === "semana" ? "grid-cols-7" : "grid-cols-7";
  const minH = mode === "semana" ? "min-h-40" : "min-h-24";

  return (
    <div className="space-y-3" data-testid="calendario-board">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div
        className={`mb-3 grid ${cols} gap-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]/55`}
      >
        {weekLabels.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className={`grid ${cols} gap-2`}>
        {days.map((c, i) => {
          if (!c.ymd) {
            return <div key={`e-${i}`} className={`${minH} rounded-xl bg-white/30`} />;
          }
          const isToday = c.ymd === todayKey;
          const isOver = dragOverYmd === c.ymd;
          return (
            <div
              key={c.ymd}
              data-ymd={c.ymd}
              data-testid={`cal-day-${c.ymd}`}
              onDragOver={(e) => onDragOver(e, c.ymd)}
              onDragLeave={() => onDragLeave(c.ymd)}
              onDrop={(e) => void onDrop(e, c.ymd)}
              className={`${minH} rounded-xl border px-2 py-2 transition-colors ${
                isOver
                  ? "border-[var(--sea)] bg-[var(--sea)]/15"
                  : isToday
                    ? "border-[var(--sea)] bg-[var(--sea)]/8"
                    : "border-[var(--line)] bg-white/60"
              }`}
            >
              <div className="text-xs font-semibold">
                {mode === "semana"
                  ? Number(c.ymd.slice(8))
                  : Number(c.ymd.slice(8))}
              </div>
              <div className="mt-1 space-y-1">
                {c.p.slice(0, mode === "semana" ? 6 : 2).map((x) => {
                  const urg = clasificarUrgencia(new Date(x.fechaLimite));
                  return (
                    <Link
                      key={x.id}
                      href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                      className={`block truncate rounded px-1 text-[10px] ${
                        x.esFatal || urg === "critico" || urg === "vencido"
                          ? "bg-red-100 text-red-800"
                          : "bg-[var(--copper)]/15 text-[var(--ink)]"
                      }`}
                      title={x.titulo}
                    >
                      {x.esFatal ? "F · " : ""}
                      {x.titulo}
                    </Link>
                  );
                })}
                {c.t.slice(0, mode === "semana" ? 6 : 2).map((x) => (
                  <Link
                    key={x.id}
                    href={x.siteId ? `/sites/${x.siteId}/tareas` : "/tareas"}
                    className="block truncate rounded bg-[var(--sea)]/10 px-1 text-[10px] text-[var(--ink)]"
                    title={x.title}
                  >
                    {x.title}
                  </Link>
                ))}
                {c.a.slice(0, mode === "semana" ? 6 : 2).map((x) => (
                  <Link
                    key={x.id}
                    href={`/causas/${x.causaId}`}
                    className="block truncate rounded bg-amber-100 px-1 text-[10px] text-amber-950"
                    title={x.titulo}
                  >
                    {x.titulo}
                  </Link>
                ))}
                {c.ev.slice(0, mode === "semana" ? 8 : 3).map((x) => x.teachingHref ? (
                  <Link key={x.id} href={x.teachingHref} className="block truncate rounded bg-[var(--sea-soft)] px-1 text-[10px] text-[var(--ink)]" title={`Docencia · ${x.titulo}`}>
                    Docencia · {x.titulo}
                  </Link>
                ) : (
                  <div
                    key={x.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, x)}
                    data-testid={`cal-evento-${x.id}`}
                    className={`cursor-grab truncate rounded bg-emerald-100 px-1 text-[10px] text-emerald-950 active:cursor-grabbing ${
                      busyId === x.id ? "opacity-50" : ""
                    }`}
                    title={`${x.titulo} (arrastre a otro día)`}
                  >
                    {x.titulo}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[var(--ink-soft)]/60">
        Arrastre un evento (verde) a otro día para reprogramarlo. Se conserva la hora.
      </p>
    </div>
  );
}
