"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import { operationKey } from "@/lib/client-submission-key";
import { formatCivilDate } from "@/lib/chile-time";
import { ACADEMIC_CONGRESS_ACTION_STATUS, ACADEMIC_CONGRESS_LIMITS, emptyAcademicCongress, type AcademicCongress, type AcademicCongressAction } from "@/lib/altazor/academic-schemas";
import { AcademicCommitteeDeliverables } from "./AcademicCommitteeDeliverables";
import styles from "./AcademicCongressActions.module.css";

export function AcademicCongressActions({ value, workspaceId, documents, disabled, onChange }: {
  value: AcademicCongress | undefined;
  workspaceId: string;
  documents: { id: string; title: string; href: string }[];
  disabled: boolean;
  onChange: (value: AcademicCongress) => void;
}) {
  const congress = value ?? emptyAcademicCongress;
  const actions = congress.actions ?? [];
  const [removal, setRemoval] = useState<{ id: string; title: string } | null>(null);
  const section = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const pending = actions.filter(action => action.status !== "done").length;
  const completed = actions.length - pending;
  const totalDeliverables = actions.reduce((count, action) => count + (action.deliverables?.length ?? 0), 0);

  useEffect(() => {
    function reveal() {
      const hash = window.location.hash;
      if (hash !== "#encargos-comite" && !hash.startsWith("#encargo-")) return;
      if (disclosure.current) disclosure.current.open = true;
      requestAnimationFrame(() => {
        const target = hash === "#encargos-comite" ? section.current : document.getElementById(hash.slice(1));
        if (!target || !section.current?.contains(target)) return;
        const editor = target.querySelector("details");
        if (editor) editor.open = true;
        target.scrollIntoView({ block: "start" });
      });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  function focusControl(key: string) {
    requestAnimationFrame(() => {
      const control = section.current?.querySelector<HTMLElement>(`[data-action-focus="${key}"]`);
      const editor = control?.closest("details");
      if (editor) editor.open = true;
      control?.focus();
    });
  }

  function add() {
    if (actions.length >= ACADEMIC_CONGRESS_LIMITS.actions) return;
    const id = operationKey();
    onChange({ ...congress, actions: [...actions, { id, title: "", responsible: "", status: "pending", notes: "" }] });
    focusControl(id);
  }

  function update(id: string, changes: Partial<AcademicCongressAction>) {
    onChange({ ...congress, actions: actions.map(action => action.id === id ? { ...action, ...changes } : action) });
  }

  function remove() {
    if (!removal) return;
    onChange({ ...congress, actions: actions.filter(action => action.id !== removal.id) });
    setRemoval(null);
    focusControl("add");
  }

  return <section ref={section} id="encargos-comite" className={styles.root} aria-label="Encargos del comité">
    <details ref={disclosure}>
      <summary>
        <ListChecks size={18} aria-hidden="true" />
        <span>Encargos del comité</span>
        <span className={styles.count}>{pending === 1 ? "1 pendiente" : `${pending} pendientes`} · {completed === 1 ? "1 completado" : `${completed} completados`}</span>
      </summary>
      <div className={styles.body}>
        <p className={styles.helper}>Guarda los cambios para llevar las fechas pendientes a tu Agenda. Usa la hora de Santiago.</p>
        {actions.length === 0 && <p className={styles.helper}>Añade un encargo del congreso o vincúlalo a una de sus mesas.</p>}
        {actions.map((action, index) => {
          const number = index + 1;
          const deliverables = action.deliverables ?? [];
          const approved = deliverables.filter(item => item.status === "approved").length;
          const awaitingReview = deliverables.filter(item => item.status === "submitted").length;
          return <section key={action.id} id={`encargo-${action.id}`} className={styles.action} role="group" aria-label={`Encargo ${number}`}>
            <details>
              <summary>
                <span className={styles.actionHeading}>
                  <strong>{action.title.trim() || `Encargo ${number}`}</strong>
                  <span>{ACADEMIC_CONGRESS_ACTION_STATUS[action.status]}{action.dueAtLocal && ` · ${formatCivilDate(action.dueAtLocal.slice(0, 10))} · ${action.dueAtLocal.slice(11)}`}</span>
                  {deliverables.length > 0 && <span>{approved} de {deliverables.length} entregables aprobados{awaitingReview > 0 && ` · ${awaitingReview} para revisar`}</span>}
                </span>
              </summary>
              <div className={styles.editor}>
                <div className={styles.fields}>
                  <label className={styles.title}>Encargo {number}
                    <input value={action.title} required maxLength={ACADEMIC_CONGRESS_LIMITS.titleLength} disabled={disabled}
                      data-action-focus={action.id} onChange={event => update(action.id, { title: event.target.value })} />
                  </label>
                  <label>Estado del encargo {number}
                    <select value={action.status} aria-label={`Estado del encargo ${number}`} disabled={disabled}
                      onChange={event => update(action.id, { status: event.target.value as AcademicCongressAction["status"] })}>
                      {Object.entries(ACADEMIC_CONGRESS_ACTION_STATUS).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                    </select>
                  </label>
                  <label>Mesa del encargo {number}
                    <select value={action.tableId ?? ""} aria-label={`Mesa del encargo ${number}`} disabled={disabled}
                      onChange={event => {
                        const tableId = event.target.value || undefined;
                        const table = congress.tables.find(item => item.id === tableId);
                        update(action.id, { tableId, responsible: action.responsible.trim() ? action.responsible : table?.responsible ?? "" });
                      }}>
                      <option value="">Seguimiento general</option>
                      {congress.tables.map((table, tableIndex) => <option key={table.id} value={table.id}>{table.title.trim() || `Mesa ${tableIndex + 1}`}</option>)}
                    </select>
                  </label>
                  <label>Responsable del encargo {number}
                    <input value={action.responsible} maxLength={ACADEMIC_CONGRESS_LIMITS.responsibleLength} disabled={disabled}
                      placeholder="Nombre de la persona responsable" onChange={event => update(action.id, { responsible: event.target.value })} />
                  </label>
                  <label>Fecha del encargo {number}
                    <input type="datetime-local" value={action.dueAtLocal ?? ""} disabled={disabled}
                      onChange={event => update(action.id, { dueAtLocal: event.target.value || undefined })} />
                  </label>
                </div>
                <details className={styles.notes}>
                  <summary>Indicaciones</summary>
                  <label>Indicaciones del encargo {number}
                    <textarea aria-label={`Indicaciones del encargo ${number}`} rows={4} value={action.notes} maxLength={ACADEMIC_CONGRESS_LIMITS.actionNotesLength} disabled={disabled}
                      placeholder="Qué hay que hacer y qué debe tenerse en consideración." onChange={event => update(action.id, { notes: event.target.value })} />
                  </label>
                </details>
                <AcademicCommitteeDeliverables value={action.deliverables} workspaceId={workspaceId} documents={documents}
                  actionNumber={number} disabled={disabled} remaining={ACADEMIC_CONGRESS_LIMITS.deliverables - totalDeliverables}
                  onChange={items => update(action.id, { deliverables: items })} />
                {action.agreementOrigin && <details className={styles.notes}>
                  <summary>Origen del encargo</summary>
                  <div className={styles.origin}>
                    <p><strong>{action.agreementOrigin.meetingTitle}</strong></p>
                    <time dateTime={action.agreementOrigin.meetingDate}>{formatCivilDate(action.agreementOrigin.meetingDate)}</time>
                    <p className={styles.agreement}>{action.agreementOrigin.agreementText}</p>
                    {congress.meetings?.some(meeting => meeting.id === action.agreementOrigin?.meetingId)
                      && <a href="#reuniones-comite">Ver reunión</a>}
                  </div>
                </details>}
                <button type="button" className="btn btn-ghost" disabled={disabled} aria-label={`Quitar encargo ${number}`}
                  onClick={() => setRemoval({ id: action.id, title: action.title.trim() || `Encargo ${number}` })}>
                  <Trash2 size={16} aria-hidden="true" /> Quitar encargo
                </button>
              </div>
            </details>
          </section>;
        })}
        <button type="button" className="btn btn-outline" data-action-focus="add" disabled={disabled || actions.length >= ACADEMIC_CONGRESS_LIMITS.actions} onClick={add}>
          <Plus size={16} aria-hidden="true" /> Añadir encargo
        </button>
        {actions.length >= ACADEMIC_CONGRESS_LIMITS.actions && <p className={styles.helper}>Puedes conservar hasta {ACADEMIC_CONGRESS_LIMITS.actions} encargos por congreso.</p>}
      </div>
    </details>
    <ConfirmDialog open={Boolean(removal)} onClose={() => setRemoval(null)} onConfirm={remove} busy={disabled}
      title="Quitar encargo del comité" description={`Se quitará «${removal?.title ?? ""}», sus indicaciones y el seguimiento de sus entregables. Los documentos vinculados se conservan. Guarda los cambios del trabajo para confirmar la eliminación.`}
      confirmLabel="Quitar encargo" />
  </section>;
}
