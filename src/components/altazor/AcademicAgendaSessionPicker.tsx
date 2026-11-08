"use client";

import { useEffect, useId, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { TeachingSession } from "@/lib/altazor/teaching-sessions";
import { SANTIAGO_TZ, santiagoDateKey } from "@/lib/chile-time";
import { academicApi } from "./academic-ui";
import styles from "./AcademicAgendaSessionPicker.module.css";

const day = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: SANTIAGO_TZ });
const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: SANTIAGO_TZ });

export function AcademicAgendaSessionPicker({ documentKind, workspaceId, version, selection, onChange, disabled }: {
  documentKind: "syllabus" | "programa";
  workspaceId: string;
  version: number;
  selection: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const groupId = useId();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ version: number; attempt: number; sessions: TeachingSession[]; error?: string } | null>(null);
  const current = result?.version === version && result.attempt === attempt ? result : null;
  const sessions = current?.sessions ?? [];
  const availableIds = new Set(sessions.map(session => session.id));
  const selectedIds = new Set(selection);
  const availableSelection = selection.filter(id => availableIds.has(id));
  const missingCount = current && !current.error ? selection.length - availableSelection.length : 0;
  const countLabel = selection.length === 1 ? "1 elegida" : `${selection.length} elegidas`;

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `/api/altazor/academic/${encodeURIComponent(workspaceId)}/teaching-sessions`;
    void academicApi<{ sessions: TeachingSession[] }>(endpoint, undefined, "GET", controller.signal)
      .then(({ sessions }) => {
        if (!controller.signal.aborted) setResult({ version, attempt, sessions });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ version, attempt, sessions: [], error: "No se pudo consultar la Agenda. Vuelve a cargarla." });
      });
    return () => controller.abort();
  }, [workspaceId, version, attempt]);

  return <details className={styles.picker} id={documentKind === "syllabus" ? "syllabus-agenda" : "programa-agenda"}>
    <summary>
      <CalendarDays size={17} aria-hidden="true" />
      <span>Sesiones de la Agenda</span>
      <span className={styles.count}>{countLabel}</span>
      <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
    </summary>
    <div className={styles.body}>
      <p id={groupId}>Elige qué sesiones aparecerán en el {documentKind} con sus horarios, lecturas, materiales y resultados de aprendizaje. Cada borrador conserva una copia del contenido seleccionado.</p>
      {!current && <p role="status">Consultando sesiones…</p>}
      {current?.error && <div className={styles.actions}>
        <p role="alert">{current.error}</p>
        <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Volver a cargar</button>
      </div>}
      {missingCount > 0 && <div className={styles.actions}>
        <p role="status">{missingCount === 1 ? "Una sesión elegida ya no está en la Agenda." : `${missingCount} sesiones elegidas ya no están en la Agenda.`}</p>
        <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => onChange(availableSelection)}>Quitar sesiones retiradas</button>
      </div>}
      {current && !current.error && sessions.length === 0 && <p>Todavía no hay sesiones. <a href="#agenda-docencia">Ir a Actividades en mi Agenda</a>.</p>}
      {sessions.length > 0 && <fieldset aria-describedby={groupId} disabled={disabled} className={styles.choices}>
        <legend className="sr-only">Sesiones para el {documentKind}</legend>
        <ul className={styles.rows}>
          {sessions.map(session => {
            const date = new Date(session.startsAt);
            const end = session.endsAt ? new Date(session.endsAt) : null;
            const endDate = end && santiagoDateKey(date) !== santiagoDateKey(end) ? `${day.format(end)} · ` : "";
            return <li key={session.id}>
              <label>
                <input type="checkbox" checked={selectedIds.has(session.id)} onChange={event =>
                  onChange(event.target.checked ? [...selection, session.id] : selection.filter(id => id !== session.id))
                } />
                <span className={styles.session}>
                  <strong>{session.title}</strong>
                  <span>{day.format(date)} · {time.format(date)}{end && ` – ${endDate}${time.format(end)}`} · Santiago</span>
                </span>
              </label>
            </li>;
          })}
        </ul>
      </fieldset>}
      {selection.length > 0 && <button type="button" className="btn btn-ghost justify-self-start" disabled={disabled} onClick={() => onChange([])}>Limpiar selección</button>}
    </div>
  </details>;
}
