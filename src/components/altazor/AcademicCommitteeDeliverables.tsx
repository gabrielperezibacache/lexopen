"use client";

import { useRef, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import { operationKey } from "@/lib/client-submission-key";
import { ACADEMIC_CONGRESS_DELIVERABLE_STATUS, ACADEMIC_CONGRESS_LIMITS, type AcademicCongressDeliverable } from "@/lib/altazor/academic-schemas";
import { parseCommitteeDeliverableHref } from "@/lib/altazor/committee-deliverables";
import styles from "./AcademicCommitteeDeliverables.module.css";

export type AcademicCommitteeDocument = { id: string; title: string; href: string };

export function AcademicCommitteeDeliverables({ workspaceId, value, disabled, onChange, actionNumber, documents = [], remaining }: {
  workspaceId: string;
  value: AcademicCongressDeliverable[] | undefined;
  disabled: boolean;
  onChange: (items: AcademicCongressDeliverable[]) => void;
  actionNumber: number;
  documents?: AcademicCommitteeDocument[];
  remaining: number;
}) {
  const items = value ?? [];
  const approved = items.filter(item => item.status === "approved").length;
  const submitted = items.filter(item => item.status === "submitted").length;
  const [removal, setRemoval] = useState<{ id: string; title: string } | null>(null);
  const root = useRef<HTMLDetailsElement>(null);
  const atLimit = items.length >= ACADEMIC_CONGRESS_LIMITS.deliverablesPerAction || remaining <= 0;

  function focusControl(key: string) {
    requestAnimationFrame(() => {
      if (root.current) root.current.open = true;
      root.current?.querySelector<HTMLElement>(`[data-deliverable-focus="${key}"]`)?.focus();
    });
  }

  function add() {
    if (disabled || atLimit) return;
    const id = operationKey();
    onChange([...items, { id, title: "", status: "pending", notes: "" }]);
    focusControl(id);
  }

  function update(id: string, changes: Partial<AcademicCongressDeliverable>) {
    onChange(items.map(item => item.id === id ? { ...item, ...changes } : item));
  }

  function remove() {
    if (!removal || disabled) return;
    onChange(items.filter(item => item.id !== removal.id));
    setRemoval(null);
    focusControl("add");
  }

  return <>
    <details ref={root} className={styles.root}>
      <summary>
        <span>Entregables</span>
        <span className={styles.count}>{items.length ? `${approved} de ${items.length} aprobados${submitted ? ` · ${submitted} para revisar` : ""}` : "Sin entregables"}</span>
      </summary>
      <div className={styles.body}>
        <p className={styles.helper}>{items.length
          ? "Revisa cada entrega y conserva tus observaciones. Guarda los cambios del trabajo para actualizar el avance."
          : "Define qué esperas recibir y vincula su archivo o un documento de este trabajo."}</p>
        {items.map((item, index) => {
          const number = index + 1;
          const label = `entregable ${number} del encargo ${actionNumber}`;
          const href = item.href?.trim() ?? "";
          const parsed = href ? parseCommitteeDeliverableHref(href) : null;
          const safeHref = parsed && (parsed.kind !== "academic" || parsed.workspaceId === workspaceId);
          const selected = documents.find(document => document.href === href);
          const errorId = `deliverable-link-${item.id}`;
          return <section key={item.id} className={styles.item} role="group" aria-label={`Entregable ${number} del encargo ${actionNumber}`}>
            <div className={styles.fields}>
              <label className={styles.title}>Entregable {number}
                <input aria-label={`Entregable ${number} del encargo ${actionNumber}`} value={item.title} required
                  maxLength={ACADEMIC_CONGRESS_LIMITS.titleLength} disabled={disabled} data-deliverable-focus={item.id}
                  placeholder="Qué debe entregarse" onChange={event => update(item.id, { title: event.target.value })} />
              </label>
              <label>Estado
                <select aria-label={`Estado del ${label}`} value={item.status} disabled={disabled}
                  onChange={event => update(item.id, { status: event.target.value as AcademicCongressDeliverable["status"] })}>
                  {Object.entries(ACADEMIC_CONGRESS_DELIVERABLE_STATUS).map(([status, title]) => <option key={status} value={status}>{title}</option>)}
                </select>
              </label>
              {documents.length > 0 && <label>Documento de este trabajo
                <select aria-label={`Documento de este trabajo para el ${label}`} value={selected?.id ?? ""} disabled={disabled}
                  onChange={event => {
                    const document = documents.find(option => option.id === event.target.value);
                    if (!document) return;
                    update(item.id, { href: document.href, ...(!item.title.trim() ? { title: document.title.slice(0, ACADEMIC_CONGRESS_LIMITS.titleLength) } : {}) });
                  }}>
                  <option value="">Elegir documento</option>
                  {documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}
                </select>
              </label>}
              <label className={styles.full}>Archivo o enlace
                <input aria-label={`Enlace del ${label}`} type="text" inputMode="url" autoCapitalize="none" spellCheck={false}
                  value={item.href ?? ""} maxLength={ACADEMIC_CONGRESS_LIMITS.deliverableHrefLength} disabled={disabled}
                  aria-invalid={Boolean(href && !safeHref)} aria-describedby={href && !safeHref ? errorId : undefined}
                  placeholder="https://… o enlace de tu Biblioteca" onChange={event => update(item.id, { href: event.target.value || undefined })} />
              </label>
            </div>
            {href && !safeHref && <p className={styles.error} id={errorId}>Usa un enlace HTTPS, de tu Biblioteca o de un documento de este trabajo.</p>}
            {safeHref && <a className={styles.openLink} href={href} target="_blank" rel="noopener noreferrer">Abrir entregable <ExternalLink size={15} aria-hidden="true" /></a>}
            <label>Observaciones de revisión
              <textarea aria-label={`Observaciones de revisión del ${label}`} rows={3} value={item.notes}
                maxLength={ACADEMIC_CONGRESS_LIMITS.deliverableNotesLength} disabled={disabled}
                placeholder="Qué falta, qué revisar o qué se aprobó." onChange={event => update(item.id, { notes: event.target.value })} />
            </label>
            <button type="button" className="btn btn-ghost" disabled={disabled} aria-label={`Quitar ${label}`}
              onClick={() => setRemoval({ id: item.id, title: item.title.trim() || `Entregable ${number}` })}>
              <Trash2 size={16} aria-hidden="true" /> Quitar entregable
            </button>
          </section>;
        })}
        <button type="button" className="btn btn-outline" data-deliverable-focus="add" disabled={disabled || atLimit} onClick={add}>
          <Plus size={16} aria-hidden="true" /> Añadir entregable
        </button>
        {atLimit && <p className={styles.helper}>{items.length >= ACADEMIC_CONGRESS_LIMITS.deliverablesPerAction
          ? `Puedes conservar hasta ${ACADEMIC_CONGRESS_LIMITS.deliverablesPerAction} entregables por encargo.`
          : `El congreso alcanzó el límite de ${ACADEMIC_CONGRESS_LIMITS.deliverables} entregables.`}</p>}
      </div>
    </details>
    <ConfirmDialog open={Boolean(removal)} onClose={() => setRemoval(null)} onConfirm={remove} busy={disabled}
      title="Quitar entregable del encargo" description={`Se quitará «${removal?.title ?? ""}» y sus observaciones del encargo. El archivo original se conserva. Guarda los cambios del trabajo para confirmar la eliminación.`}
      confirmLabel="Quitar entregable" />
  </>;
}
