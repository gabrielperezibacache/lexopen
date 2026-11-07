"use client";

import { useEffect, useRef, useState } from "react";
import { Layers3, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import { operationKey } from "@/lib/client-submission-key";
import { SANTIAGO_TZ } from "@/lib/chile-time";
import { ACADEMIC_CONGRESS_LIMITS, emptyAcademicCongress, type AcademicCongress } from "@/lib/altazor/academic-schemas";
import type { TeachingSession } from "@/lib/altazor/teaching-sessions";
import { academicApi } from "./academic-ui";
import styles from "./AcademicCongressOrganization.module.css";

const limits = ACADEMIC_CONGRESS_LIMITS;
const sessionTime = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
type Table = AcademicCongress["tables"][number];
type Removal = { kind: "axis" | "table"; id: string; title: string };

export function AcademicCongressOrganization({ workspaceId, version, value, disabled, onChange }: {
  workspaceId: string;
  version: number;
  value: AcademicCongress | undefined;
  disabled: boolean;
  onChange: (value: AcademicCongress) => void;
}) {
  const congress = value ?? emptyAcademicCongress;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ workspaceId: string; version: number; attempt: number; sessions: TeachingSession[]; error?: string } | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const root = useRef<HTMLElement>(null);
  const current = result?.workspaceId === workspaceId && result.version === version && result.attempt === attempt ? result : null;
  const sessions = current?.sessions ?? [];
  const available = new Set(sessions.map(session => session.id));
  const assigned = new Map(congress.tables.flatMap(table => table.sessionIds.map(id => [id, table] as const)));

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `/api/altazor/academic/${encodeURIComponent(workspaceId)}/teaching-sessions`;
    void academicApi<{ sessions: TeachingSession[] }>(endpoint, undefined, "GET", controller.signal)
      .then(({ sessions }) => {
        if (!controller.signal.aborted) setResult({ workspaceId, version, attempt, sessions: sessions.filter(session => !session.callDeadline) });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ workspaceId, version, attempt, sessions: [], error: "No se pudieron consultar las sesiones. Vuelve a cargarlas." });
      });
    return () => controller.abort();
  }, [workspaceId, version, attempt]);

  function focusControl(key: string) {
    requestAnimationFrame(() => {
      const control = root.current?.querySelector<HTMLElement>(`[data-congress-focus="${key}"]`);
      control?.focus();
      if (control instanceof HTMLInputElement) control.select();
    });
  }

  function addAxis() {
    if (congress.axes.length >= limits.axes) return;
    const id = operationKey();
    onChange({ ...congress, axes: [...congress.axes, { id, title: "" }] });
    focusControl(id);
  }

  function addTable(axisId: string) {
    if (congress.tables.length >= limits.tables) return;
    const id = operationKey();
    onChange({ ...congress, tables: [...congress.tables, { id, axisId, title: "", responsible: "", sessionIds: [] }] });
    focusControl(id);
  }

  function updateTable(id: string, change: Partial<Table>) {
    onChange({ ...congress, tables: congress.tables.map(table => table.id === id ? { ...table, ...change } : table) });
  }

  function remove() {
    if (!removal) return;
    onChange(removal.kind === "axis" ? {
      axes: congress.axes.filter(axis => axis.id !== removal.id),
      tables: congress.tables.filter(table => table.axisId !== removal.id),
    } : { ...congress, tables: congress.tables.filter(table => table.id !== removal.id) });
    setRemoval(null);
    focusControl("add-axis");
  }

  return <section ref={root} className={styles.root} aria-label="Organización del congreso">
    <details>
      <summary><Layers3 size={18} aria-hidden="true" /> Ejes y mesas</summary>
      <div className={styles.body}>
        <p className={styles.helper}>Organiza las mesas y escribe quién se encarga de cada una. Vincula aquí sus sesiones y elige en <a href="#programa-agenda">Sesiones de la Agenda</a> cuáles aparecerán en el programa.</p>
        {congress.axes.length === 0 && <p className={styles.helper}>Añade el primer eje temático para organizar sus mesas.</p>}
        {congress.axes.map((axis, axisIndex) => <section key={axis.id} className={styles.axis} role="group" aria-label={`Eje ${axisIndex + 1}`}>
          <div className={styles.axisHeading}>
            <label>Nombre del eje {axisIndex + 1}
              <input value={axis.title} required maxLength={limits.titleLength} disabled={disabled} data-congress-focus={axis.id}
                onChange={event => onChange({ ...congress, axes: congress.axes.map(item => item.id === axis.id ? { ...item, title: event.target.value } : item) })} />
            </label>
            <button type="button" className="btn btn-ghost" disabled={disabled} aria-label={`Quitar eje ${axisIndex + 1}`}
              onClick={() => setRemoval({ kind: "axis", id: axis.id, title: axis.title.trim() || `Eje ${axisIndex + 1}` })}>
              <Trash2 size={16} aria-hidden="true" /> Quitar eje
            </button>
          </div>
          <div className={styles.tables}>
            {congress.tables.filter(table => table.axisId === axis.id).map(table => {
              const tableNumber = congress.tables.findIndex(item => item.id === table.id) + 1;
              const missing = current && !current.error ? table.sessionIds.filter(id => !available.has(id)) : [];
              return <section key={table.id} className={styles.table} role="group" aria-label={`Mesa ${tableNumber}`}>
                <div className={styles.fields}>
                  <label>Nombre de la mesa {tableNumber}
                    <input value={table.title} required maxLength={limits.titleLength} disabled={disabled} data-congress-focus={table.id}
                      onChange={event => updateTable(table.id, { title: event.target.value })} />
                  </label>
                  <label>Responsable de la mesa {tableNumber}
                    <input value={table.responsible} maxLength={limits.responsibleLength} disabled={disabled} placeholder="Nombre de la persona responsable"
                      onChange={event => updateTable(table.id, { responsible: event.target.value })} />
                  </label>
                  {congress.axes.length > 1 && <label>Eje de la mesa {tableNumber}
                    <select aria-label={`Eje de la mesa ${tableNumber}`} value={table.axisId} disabled={disabled} onChange={event => updateTable(table.id, { axisId: event.target.value })}>
                      {congress.axes.map((item, index) => <option key={item.id} value={item.id}>{item.title.trim() || `Eje ${index + 1}`}</option>)}
                    </select>
                  </label>}
                </div>
                <details className={styles.sessions}>
                  <summary><span>Sesiones de la mesa</span><span>{table.sessionIds.length}</span></summary>
                  {!current && <p className={styles.helper} role="status">Consultando sesiones…</p>}
                  {current?.error && <div className={styles.recovery}>
                    <p className={styles.error} role="alert">{current.error}</p>
                    <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Volver a cargar sesiones</button>
                  </div>}
                  {missing.length > 0 && <div className={styles.recovery}>
                    <p className={styles.helper} role="status">{missing.length === 1 ? "Una sesión vinculada ya no está en la Agenda." : `${missing.length} sesiones vinculadas ya no están en la Agenda.`}</p>
                    <button type="button" className="btn btn-outline" disabled={disabled}
                      onClick={() => updateTable(table.id, { sessionIds: table.sessionIds.filter(id => available.has(id)) })}>Quitar sesiones retiradas</button>
                  </div>}
                  {current && !current.error && sessions.length === 0 && <p className={styles.helper}>Añade sesiones en <a href="#agenda-docencia">Actividades en mi Agenda</a> para vincularlas a esta mesa.</p>}
                  {sessions.length > 0 && <fieldset disabled={disabled} className={styles.choices}>
                    <legend className="sr-only">Sesiones de la mesa {tableNumber}</legend>
                    <ul>{sessions.map(session => {
                      const other = assigned.get(session.id);
                      const unavailable = Boolean(other && other.id !== table.id);
                      return <li key={session.id}>
                        <label>
                          <input type="checkbox" checked={table.sessionIds.includes(session.id)} disabled={unavailable}
                            onChange={event => updateTable(table.id, { sessionIds: event.target.checked ? [...table.sessionIds, session.id] : table.sessionIds.filter(id => id !== session.id) })} />
                          <span><strong>{session.title}</strong><small>{sessionTime.format(new Date(session.startsAt))} · Santiago</small>
                            {unavailable && <small>Vinculada a {other?.title.trim() || "otra mesa"}</small>}
                          </span>
                        </label>
                      </li>;
                    })}</ul>
                  </fieldset>}
                </details>
                <button type="button" className="btn btn-ghost" disabled={disabled} aria-label={`Quitar mesa ${tableNumber}`}
                  onClick={() => setRemoval({ kind: "table", id: table.id, title: table.title.trim() || `Mesa ${tableNumber}` })}>
                  <Trash2 size={16} aria-hidden="true" /> Quitar mesa
                </button>
              </section>;
            })}
          </div>
          <button type="button" className="btn btn-outline" disabled={disabled || congress.tables.length >= limits.tables} onClick={() => addTable(axis.id)}>
            <Plus size={16} aria-hidden="true" /> Añadir mesa
          </button>
        </section>)}
        <button type="button" className="btn btn-outline" data-congress-focus="add-axis" disabled={disabled || congress.axes.length >= limits.axes} onClick={addAxis}>
          <Plus size={16} aria-hidden="true" /> Añadir eje
        </button>
        {congress.axes.length >= limits.axes && <p className={styles.helper}>Puedes organizar hasta {limits.axes} ejes en un congreso.</p>}
        {congress.tables.length >= limits.tables && <p className={styles.helper}>Puedes organizar hasta {limits.tables} mesas en un congreso.</p>}
      </div>
    </details>
    <ConfirmDialog open={Boolean(removal)} onClose={() => setRemoval(null)} onConfirm={remove} busy={disabled}
      title={removal?.kind === "axis" ? "Quitar eje del congreso" : "Quitar mesa del congreso"}
      description={removal?.kind === "axis"
        ? `Se quitarán «${removal.title}», sus mesas y sus vínculos con las sesiones. Las actividades seguirán disponibles en la Agenda.`
        : `Se quitarán «${removal?.title ?? ""}», su responsable y sus vínculos con las sesiones. Las actividades seguirán disponibles en la Agenda.`}
      confirmLabel={removal?.kind === "axis" ? "Quitar eje" : "Quitar mesa"} />
  </section>;
}
