"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, NotebookPen, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import { operationKey } from "@/lib/client-submission-key";
import { formatCivilDate, isValidYmd, santiagoDateKey } from "@/lib/chile-time";
import { ACADEMIC_CONGRESS_LIMITS, emptyAcademicCongress, type AcademicCongress, type AcademicCongressMeeting } from "@/lib/altazor/academic-schemas";
import styles from "./AcademicCongressMeetings.module.css";

type Removal = { kind: "meeting"; id: string; title: string }
  | { kind: "agreement"; meetingId: string; id: string; title: string };

export function AcademicCongressMeetings({ value, disabled, onChange, onConvert }: {
  value: AcademicCongress | undefined;
  disabled: boolean;
  onChange: (value: AcademicCongress) => void;
  onConvert: (meetingId: string, agreementId: string) => Promise<void>;
}) {
  const congress = value ?? emptyAcademicCongress;
  const meetings = congress.meetings ?? [];
  const actions = congress.actions ?? [];
  const agreementCount = meetings.reduce((count, meeting) => count + meeting.agreements.length, 0);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const root = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const busy = disabled || converting !== null;

  useEffect(() => {
    function reveal() {
      if (window.location.hash !== "#reuniones-comite") return;
      if (disclosure.current) disclosure.current.open = true;
      requestAnimationFrame(() => root.current?.scrollIntoView({ block: "start" }));
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  function focusControl(key: string) {
    requestAnimationFrame(() => {
      const control = root.current?.querySelector<HTMLElement>(`[data-meeting-focus="${key}"]`);
      const editor = control?.closest("details");
      if (editor) editor.open = true;
      control?.focus();
    });
  }

  function addMeeting() {
    if (meetings.length >= ACADEMIC_CONGRESS_LIMITS.meetings) return;
    const id = operationKey();
    onChange({ ...congress, meetings: [...meetings, { id, title: "", date: santiagoDateKey(new Date()), attendees: "", notes: "", agreements: [] }] });
    focusControl(id);
  }

  function updateMeeting(id: string, changes: Partial<AcademicCongressMeeting>) {
    onChange({ ...congress, meetings: meetings.map(meeting => meeting.id === id ? { ...meeting, ...changes } : meeting) });
  }

  function addAgreement(meeting: AcademicCongressMeeting) {
    if (agreementCount >= ACADEMIC_CONGRESS_LIMITS.agreements || meeting.agreements.length >= ACADEMIC_CONGRESS_LIMITS.agreementsPerMeeting) return;
    const id = operationKey();
    updateMeeting(meeting.id, { agreements: [...meeting.agreements, { id, text: "" }] });
    focusControl(id);
  }

  async function convert(meetingId: string, agreementId: string) {
    if (busy) return;
    setError("");
    setConverting(agreementId);
    try { await onConvert(meetingId, agreementId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el encargo. Revisa el acuerdo y vuelve a intentarlo."); }
    finally { setConverting(null); }
  }

  function remove() {
    if (!removal) return;
    if (removal.kind === "meeting") {
      onChange({ ...congress, meetings: meetings.filter(meeting => meeting.id !== removal.id) });
      focusControl("add-meeting");
    } else {
      const meeting = meetings.find(item => item.id === removal.meetingId);
      if (meeting) updateMeeting(meeting.id, { agreements: meeting.agreements.filter(agreement => agreement.id !== removal.id) });
      focusControl(`add-agreement-${removal.meetingId}`);
    }
    setRemoval(null);
  }

  return <section ref={root} id="reuniones-comite" className={styles.root} aria-label="Reuniones del comité">
    <details ref={disclosure}>
      <summary>
        <NotebookPen size={18} aria-hidden="true" />
        <span>Reuniones del comité</span>
        <span className={styles.count}>{meetings.length === 1 ? "1 reunión" : `${meetings.length} reuniones`}</span>
      </summary>
      <div className={styles.body}>
        <p className={styles.helper}>Registra las decisiones y crea un encargo desde cada acuerdo que necesite seguimiento.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {meetings.map((meeting, meetingIndex) => {
          const number = meetingIndex + 1;
          const meetingReady = Boolean(meeting.title.trim() && isValidYmd(meeting.date));
          return <section key={meeting.id} className={styles.meeting} role="group" aria-label={`Reunión ${number}`}>
            <details>
              <summary>
                <span className={styles.meetingHeading}>
                  <strong>{meeting.title.trim() || `Reunión ${number}`}</strong>
                  {isValidYmd(meeting.date) && <span>{formatCivilDate(meeting.date)}</span>}
                </span>
              </summary>
              <div className={styles.editor}>
                <div className={styles.fields}>
                  <label>Nombre de la reunión {number}
                    <input value={meeting.title} required maxLength={ACADEMIC_CONGRESS_LIMITS.titleLength} disabled={busy}
                      data-meeting-focus={meeting.id} onChange={event => updateMeeting(meeting.id, { title: event.target.value })} />
                  </label>
                  <label>Fecha de la reunión {number}
                    <input type="date" value={meeting.date} required disabled={busy} onChange={event => updateMeeting(meeting.id, { date: event.target.value })} />
                  </label>
                </div>
                <details className={styles.notes}>
                  <summary>Notas y asistentes</summary>
                  <div>
                    <label>Asistentes de la reunión {number}
                      <textarea aria-label={`Asistentes de la reunión ${number}`} rows={2} value={meeting.attendees} maxLength={ACADEMIC_CONGRESS_LIMITS.meetingAttendeesLength} disabled={busy}
                        onChange={event => updateMeeting(meeting.id, { attendees: event.target.value })} />
                    </label>
                    <label>Notas de la reunión {number}
                      <textarea aria-label={`Notas de la reunión ${number}`} rows={4} value={meeting.notes} maxLength={ACADEMIC_CONGRESS_LIMITS.meetingNotesLength} disabled={busy}
                        onChange={event => updateMeeting(meeting.id, { notes: event.target.value })} />
                    </label>
                  </div>
                </details>
                <div className={styles.agreements}>
                  {meeting.agreements.length > 0 && <p className={styles.helper}>Al crear el encargo se guardan los cambios del trabajo.</p>}
                  {meeting.agreements.map((agreement, agreementIndex) => {
                    const agreementNumber = agreementIndex + 1;
                    const existing = actions.find(action => action.agreementOrigin?.meetingId === meeting.id && action.agreementOrigin.agreementId === agreement.id);
                    return <div key={agreement.id} className={styles.agreement} role="group" aria-label={`Acuerdo ${agreementNumber} de la reunión ${number}`}>
                      <label>Texto del acuerdo {agreementNumber} de la reunión {number}
                        <textarea aria-label={`Texto del acuerdo ${agreementNumber} de la reunión ${number}`} rows={3} value={agreement.text} required maxLength={ACADEMIC_CONGRESS_LIMITS.agreementTextLength} disabled={busy}
                          data-meeting-focus={agreement.id} onChange={event => updateMeeting(meeting.id, {
                            agreements: meeting.agreements.map(item => item.id === agreement.id ? { ...item, text: event.target.value } : item),
                          })} />
                      </label>
                      <div className={styles.actions}>
                        {existing ? <a className={styles.originLink} href={`#encargo-${existing.id}`}>Ver encargo <ArrowRight size={16} aria-hidden="true" /></a>
                          : <button type="button" className="btn btn-outline" disabled={busy || !meetingReady || !agreement.text.trim() || actions.length >= ACADEMIC_CONGRESS_LIMITS.actions}
                            onClick={() => void convert(meeting.id, agreement.id)}>{converting === agreement.id ? "Creando encargo…" : "Crear encargo desde este acuerdo"}<ArrowRight size={16} aria-hidden="true" /></button>}
                        <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Quitar acuerdo ${agreementNumber} de la reunión ${number}`}
                          onClick={() => setRemoval({ kind: "agreement", meetingId: meeting.id, id: agreement.id, title: meeting.title.trim() || `Reunión ${number}` })}>
                          <Trash2 size={16} aria-hidden="true" /> Quitar acuerdo
                        </button>
                      </div>
                    </div>;
                  })}
                  <button type="button" className="btn btn-outline" data-meeting-focus={`add-agreement-${meeting.id}`} disabled={busy || agreementCount >= ACADEMIC_CONGRESS_LIMITS.agreements || meeting.agreements.length >= ACADEMIC_CONGRESS_LIMITS.agreementsPerMeeting}
                    onClick={() => addAgreement(meeting)}><Plus size={16} aria-hidden="true" /> Añadir acuerdo</button>
                  {meeting.agreements.length >= ACADEMIC_CONGRESS_LIMITS.agreementsPerMeeting && <p className={styles.helper}>Puedes registrar hasta {ACADEMIC_CONGRESS_LIMITS.agreementsPerMeeting} acuerdos por reunión.</p>}
                </div>
                <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Quitar reunión ${number}`}
                  onClick={() => setRemoval({ kind: "meeting", id: meeting.id, title: meeting.title.trim() || `Reunión ${number}` })}>
                  <Trash2 size={16} aria-hidden="true" /> Quitar reunión
                </button>
              </div>
            </details>
          </section>;
        })}
        <button type="button" className="btn btn-outline" data-meeting-focus="add-meeting" disabled={busy || meetings.length >= ACADEMIC_CONGRESS_LIMITS.meetings} onClick={addMeeting}>
          <Plus size={16} aria-hidden="true" /> Añadir reunión
        </button>
        {meetings.length >= ACADEMIC_CONGRESS_LIMITS.meetings && <p className={styles.helper}>Puedes registrar hasta {ACADEMIC_CONGRESS_LIMITS.meetings} reuniones por congreso.</p>}
        {agreementCount >= ACADEMIC_CONGRESS_LIMITS.agreements && <p className={styles.helper}>El congreso alcanzó el límite de {ACADEMIC_CONGRESS_LIMITS.agreements} acuerdos.</p>}
      </div>
    </details>
    <ConfirmDialog open={Boolean(removal)} onClose={() => setRemoval(null)} onConfirm={remove} busy={busy}
      title={removal?.kind === "meeting" ? "Quitar reunión del comité" : "Quitar acuerdo de la reunión"}
      description={removal?.kind === "meeting"
        ? `Se quitarán «${removal.title}», sus notas, asistentes y acuerdos. Guarda los cambios del trabajo para confirmar la eliminación.`
        : `Se quitará el acuerdo de «${removal?.title ?? ""}». Guarda los cambios del trabajo para confirmar la eliminación.`}
      confirmLabel={removal?.kind === "meeting" ? "Quitar reunión" : "Quitar acuerdo"} />
  </section>;
}
