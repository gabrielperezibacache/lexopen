"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Download, Pencil, Repeat } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import type { TeachingSession } from "@/lib/altazor/teaching-sessions";
import type { TeachingSessionContent } from "@/lib/altazor/teaching-session-content";
import { TEACHING_REMINDER_LEADS, type TeachingReminderLead } from "@/lib/altazor/teaching-reminder-policy";
import { formatCivilDate, SANTIAGO_TZ } from "@/lib/chile-time";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { AcademicCalendarSubscription } from "./AcademicCalendarSubscription";
import { AcademicSessionContent } from "./AcademicSessionContent";
import { academicApi } from "./academic-ui";
import styles from "./AcademicTeaching.module.css";

const time = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, dateStyle: "medium", timeStyle: "short" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "No se pudo actualizar la Agenda.";
const reminderLabels: Record<TeachingReminderLead, string> = {
  15: "15 minutos antes", 60: "1 hora antes", 1440: "1 día antes", 10080: "1 semana antes",
};

function ReminderField({ label, value, onChange, disabled }: {
  label: string;
  value: TeachingReminderLead | null;
  onChange: (value: TeachingReminderLead | null) => void;
  disabled: boolean;
}) {
  return <label>{label}
    <select aria-label={label} className="input min-w-0" value={value ?? ""} disabled={disabled}
      onChange={event => {
        const value = Number(event.target.value);
        onChange(TEACHING_REMINDER_LEADS.find(minutes => minutes === value) ?? null);
      }}>
      <option value="">Sin recordatorio</option>
      {TEACHING_REMINDER_LEADS.map(minutes => <option key={minutes} value={minutes}>{reminderLabels[minutes]}</option>)}
    </select>
  </label>;
}

function TeachingSessionEditor({ session, busy, error, notice, onSave, onReminder, onClose }: {
  session: TeachingSession;
  busy: boolean;
  error: string;
  notice: string;
  onSave: (session: TeachingSession, values: { title: string; startsAtLocal: string; endsAtLocal: string | null }) => void;
  onReminder: (session: TeachingSession, minutes: TeachingReminderLead | null) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [startsAtLocal, setStartsAtLocal] = useState(session.startsAtLocal);
  const [endsAtLocal, setEndsAtLocal] = useState(session.endsAtLocal || "");
  const savedReminder = TEACHING_REMINDER_LEADS.find(minutes => minutes === session.reminderLeadMinutes) ?? null;
  const [reminder, setReminder] = useState(savedReminder);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    editor.current?.focus({ preventScroll: true });
    editor.current?.scrollIntoView({ block: "start" });
  }, []);

  return <div className={styles.sessionEditor} ref={editor} tabIndex={-1}>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
    {!session.callDeadline && <form aria-label="Editar actividad" className={styles.fields} onSubmit={event => {
      event.preventDefault();
      if (!busy) onSave(session, { title: title.trim(), startsAtLocal, endsAtLocal: endsAtLocal || null });
    }}>
      <div data-wide><h3 className="font-semibold">Editar actividad</h3>
        {session.series && <p className={styles.meta}>Los cambios se aplican a esta sesión de la serie.</p>}
      </div>
      <label data-wide>Nombre de la sesión<input className="input min-w-0" value={title} required maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
      <label>Inicio de la sesión<input className="input min-w-0" type="datetime-local" value={startsAtLocal} required disabled={busy} onChange={event => setStartsAtLocal(event.target.value)} /></label>
      <label>Término de la sesión (opcional)<input className="input min-w-0" type="datetime-local" value={endsAtLocal} disabled={busy} onChange={event => setEndsAtLocal(event.target.value)} /></label>
      <button type="submit" className="btn btn-outline justify-self-start" disabled={busy || !title.trim() || !startsAtLocal || (
        title.trim() === session.title && startsAtLocal === session.startsAtLocal && (endsAtLocal || null) === session.endsAtLocal
      )}>Guardar cambios</button>
    </form>}
    <form aria-label="Recordatorio de la sesión" className={styles.sessionReminder} onSubmit={event => {
      event.preventDefault();
      if (!busy && reminder !== savedReminder) onReminder(session, reminder);
    }}>
      <h3 className="font-semibold">Recordatorio de la sesión</h3>
      <p className={styles.meta}>Recibe un aviso en la campana de LexOpen cuando el Host esté activo.</p>
      <ReminderField label="Avisar con antelación" value={reminder} onChange={setReminder} disabled={busy} />
      <button type="submit" className="btn btn-outline justify-self-start" disabled={busy || reminder === savedReminder}>Guardar recordatorio</button>
    </form>
    <button type="button" className="btn btn-ghost justify-self-start" disabled={busy} onClick={onClose}>Cerrar opciones</button>
  </div>;
}

export function AcademicTeachingSessions({ workspaceId, deadline, deadlineSaved = true, onSessionsChange, onContentDirty }: {
  workspaceId: string;
  deadline?: string;
  deadlineSaved?: boolean;
  onSessionsChange?: () => void;
  onContentDirty?: (dirty: boolean) => void;
}) {
  const [sessions, setSessions] = useState<TeachingSession[] | null>(null);
  const [title, setTitle] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [repeat, setRepeat] = useState<"" | "1" | "2">("");
  const [count, setCount] = useState("4");
  const [reminder, setReminder] = useState<TeachingReminderLead | null>(null);
  const [agendaDate, setAgendaDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TeachingSession | null>(null);
  const [removalScope, setRemovalScope] = useState<"single" | "following">("single");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [dirtySessions, setDirtySessions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = useRef(createSubmissionKeys(undefined, `altazor:teaching:${workspaceId}`));
  const section = useRef<HTMLElement>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const endpoint = `/api/altazor/academic/${encodeURIComponent(workspaceId)}/teaching-sessions`;
  const deadlineActivity = sessions?.find(item => item.callDeadline);
  const contentDirty = dirtySessions.length > 0;

  const trackContentDraft = useCallback((id: string, dirty: boolean) => {
    setDirtySessions(current => {
      if (dirty === current.includes(id)) return current;
      return dirty ? [...current, id] : current.filter(item => item !== id);
    });
  }, []);

  useEffect(() => onContentDirty?.(contentDirty), [onContentDirty, contentDirty]);
  useEffect(() => () => onContentDirty?.(false), [onContentDirty]);

  useEffect(() => {
    const controller = new AbortController();
    void academicApi<{ sessions: TeachingSession[] }>(endpoint, undefined, "GET", controller.signal)
      .then(data => { if (!controller.signal.aborted) setSessions(data.sessions); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [endpoint, attempt]);
  useEffect(() => {
    if (window.location.hash === "#agenda-docencia") section.current?.scrollIntoView({ block: "start" });
  }, []);

  function mergeSessions(incoming: TeachingSession[]) {
    const ids = new Set(incoming.map(session => session.id));
    setSessions(current => [...(current || []).filter(item => !ids.has(item.id)), ...incoming]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)));
  }

  function closeEditor() {
    setEditingId(null);
    setEditError("");
    setEditNotice("");
    requestAnimationFrame(() => editTrigger.current?.focus());
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim() || !startsAtLocal) return;
    const input = {
      title: title.trim(), startsAtLocal, ...(endsAtLocal ? { endsAtLocal } : {}),
      ...(repeat ? { recurrence: { intervalWeeks: Number(repeat), count: Number(count) } } : {}),
      ...(reminder === null ? {} : { reminderLeadMinutes: reminder }),
    };
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await academicApi<{ session: TeachingSession | null; sessions?: TeachingSession[]; reused?: boolean }>(endpoint, { ...input, requestId: key.current.forPayload(input) });
      const incoming = result.sessions ?? (result.session ? [result.session] : []);
      key.current.complete(input);
      mergeSessions(incoming);
      onSessionsChange?.();
      setTitle(""); setStartsAtLocal(""); setEndsAtLocal(""); setRepeat(""); setCount("4"); setReminder(null);
      setNotice(result.reused
        ? incoming.length ? "La actividad ya se había registrado en tu Agenda de LexOpen." : "Esta serie ya se había registrado. Sus sesiones fueron retiradas."
        : incoming.length > 1 ? `${incoming.length} sesiones agregadas a tu Agenda de LexOpen.` : "Actividad agregada a tu Agenda de LexOpen.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function saveChanges(session: TeachingSession, values: { title: string; startsAtLocal: string; endsAtLocal: string | null }) {
    if (busy) return;
    setBusy(true); setEditError(""); setEditNotice("");
    try {
      const result = await academicApi<{ session: TeachingSession }>(`${endpoint}/${encodeURIComponent(session.id)}`, {
        ...values, expectedSequence: session.calendarSequence,
      }, "PATCH");
      mergeSessions([result.session]);
      onSessionsChange?.();
      setEditNotice("Actividad actualizada en tu Agenda de LexOpen.");
    } catch (reason) { setEditError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function saveReminder(session: TeachingSession, reminderLeadMinutes: TeachingReminderLead | null) {
    if (busy) return;
    setBusy(true); setEditError(""); setEditNotice("");
    try {
      const result = await academicApi<{ id: string; reminderLeadMinutes: TeachingReminderLead | null }>(`${endpoint}/${encodeURIComponent(session.id)}/reminder`, {
        reminderLeadMinutes,
      }, "PATCH");
      mergeSessions([{ ...session, reminderLeadMinutes: result.reminderLeadMinutes }]);
      setEditNotice(result.reminderLeadMinutes === null ? "Recordatorio desactivado." : "Recordatorio guardado.");
    } catch (reason) { setEditError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function saveContent(sessionId: string, expectedRevision: number, content: TeachingSessionContent) {
    if (busy) throw new Error("Espera a que se guarde la otra actividad.");
    setBusy(true);
    try {
      const saved = await academicApi<{ contentRevision: number; content: TeachingSessionContent }>(
        `${endpoint}/${encodeURIComponent(sessionId)}/content`, { expectedRevision, content }, "PATCH",
      );
      setSessions(current => current?.map(session => session.id === sessionId ? { ...session, ...saved } : session) ?? null);
      onSessionsChange?.();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!pendingDelete || busy) return;
    const selected = pendingDelete;
    const following = removalScope === "following" ? selected.series : undefined;
    const removed = (item: TeachingSession) => item.id === selected.id
      || Boolean(following && item.series?.id === following.id && item.series.occurrence >= following.occurrence);
    setBusy(true); setError(""); setNotice("");
    try {
      await academicApi(`${endpoint}/${encodeURIComponent(selected.id)}${following ? "?scope=following" : ""}`, {}, "DELETE");
      setSessions(current => current?.filter(item => !removed(item)) || []);
      onSessionsChange?.();
      if (sessions?.some(item => item.id === editingId && removed(item))) setEditingId(null);
      setNotice(following ? "Sesiones retiradas de tu Agenda." : "Actividad retirada de tu Agenda.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setPendingDelete(null); setBusy(false); }
  }

  async function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deadline || !deadlineTime || !deadlineSaved || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { session } = await academicApi<{ session: TeachingSession }>(endpoint, { action: "schedule-call-deadline", date: deadline, localDate: agendaDate || deadline, time: deadlineTime });
      mergeSessions([session]);
      onSessionsChange?.();
      setDeadlineTime("");
      setAgendaDate("");
      setNotice("El cierre está registrado en tu Agenda de LexOpen.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  return <section ref={section} id="agenda-docencia" aria-labelledby="agenda-docencia-heading" className="scroll-mt-28 space-y-4 border-t border-[var(--line)] pt-5">
    <div className={styles.sessionIntro}>
      <h2 id="agenda-docencia-heading" className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} aria-hidden="true" /> Actividades en mi Agenda</h2>
      <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">Registra clases, sesiones y fechas de este trabajo en tu Agenda interna de LexOpen. Usa la hora de Santiago de Chile.</p>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
    {sessions === null ? error
      ? <button type="button" className="btn btn-outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Volver a cargar actividades</button>
      : <p role="status">Cargando tus actividades…</p>
      : <>
        {deadline && <form onSubmit={saveDeadline} className="grid min-w-0 gap-3 border-b border-[var(--line)] pb-4">
          <div className={styles.sessionIntro}>
            <h3 className="font-semibold">Cierre de la convocatoria</h3>
            <p className="text-sm text-[var(--ink-soft)]">Fecha en la ficha <time dateTime={deadline}>{formatCivilDate(deadline)}</time>. Comprueba la hora y la zona de las bases para registrar el cierre en hora de Santiago.</p>
            {!deadlineSaved && <p className="text-sm text-[var(--ink-soft)]">Guarda la ficha para agendar su fecha de cierre.</p>}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label>Fecha en Santiago
              <input type="date" className="input min-w-0" value={agendaDate || deadline} onChange={event => setAgendaDate(event.target.value)} required disabled={busy || !deadlineSaved} />
            </label>
            <label>Hora en Santiago
              <input type="time" className="input min-w-0" value={deadlineTime} onChange={event => setDeadlineTime(event.target.value)} required disabled={busy || !deadlineSaved} />
            </label>
          </div>
          <button type="submit" className="btn btn-outline justify-self-start" disabled={busy || !deadlineSaved || !deadlineTime}>
            {deadlineActivity ? "Actualizar cierre en mi Agenda" : "Agregar cierre a mi Agenda"}
          </button>
        </form>}
        <form onSubmit={schedule} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">Nombre de la actividad<input className="input min-w-0" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} disabled={busy} /></label>
          <label>Inicio<input className="input min-w-0" type="datetime-local" value={startsAtLocal} onChange={event => setStartsAtLocal(event.target.value)} required disabled={busy} /></label>
          <label>Término (opcional)<input className="input min-w-0" type="datetime-local" value={endsAtLocal} onChange={event => setEndsAtLocal(event.target.value)} disabled={busy} /></label>
          <details className={`${styles.sessionOptions} sm:col-span-2`}>
            <summary><Repeat size={16} aria-hidden="true" /> Repetición y recordatorio</summary>
            <div className={styles.fields}>
              <label>Repetir
                <select aria-label="Repetir" className="input min-w-0" value={repeat} disabled={busy} onChange={event => setRepeat(event.target.value === "1" ? "1" : event.target.value === "2" ? "2" : "")}>
                  <option value="">Una sola vez</option><option value="1">Cada semana</option><option value="2">Cada dos semanas</option>
                </select>
              </label>
              {repeat && <label>Número de sesiones
                <input className="input min-w-0" type="number" min={2} max={24} step={1} required value={count}
                  onChange={event => setCount(event.target.value)} disabled={busy}
                  onInvalid={event => {
                    const options = event.currentTarget.closest("details");
                    if (options) options.open = true;
                  }} />
                <span className={styles.meta}>De 2 a 24, incluida la primera sesión.</span>
              </label>}
              <div data-wide>
                <ReminderField label="Recordatorio de la actividad" value={reminder} onChange={setReminder} disabled={busy} />
                {repeat && <p className={styles.meta}>Se aplica a cada sesión de la serie.</p>}
              </div>
            </div>
          </details>
          <button type="submit" className="btn btn-outline justify-self-start" disabled={busy || !title.trim() || !startsAtLocal}>Agregar a mi Agenda</button>
        </form>
        {sessions.length > 0 && <ul className="space-y-2">
          {sessions.map(session => <li key={session.id} className={styles.sessionRow}>
            <div className="min-w-0 break-words">
              <strong>{session.title}</strong>
              <p className="mt-1 text-sm text-[var(--ink-soft)]"><time dateTime={session.startsAt}>{time.format(new Date(session.startsAt))}</time>{session.endsAt && <> – <time dateTime={session.endsAt}>{time.format(new Date(session.endsAt))}</time></>}</p>
              {session.series && <p className={styles.sessionCaption}><Repeat size={14} aria-hidden="true" />{session.series.intervalWeeks === 1 ? "Semanal" : "Cada dos semanas"} · sesión {session.series.occurrence} de {session.series.count}</p>}
              {session.reminderLeadMinutes && <p className={styles.sessionCaption}><Bell size={14} aria-hidden="true" />
                <span className="sr-only">Recordatorio </span>
                {reminderLabels[session.reminderLeadMinutes as TeachingReminderLead]}
              </p>}
            </div>
            <div className={styles.actions}>
              {contentDirty ? <button type="button" className="btn btn-ghost" disabled title="Guarda o cancela los cambios en el contenido para abrir la Agenda.">Ver en Agenda</button>
                : <Link className="btn btn-ghost" href={session.agendaHref}>Ver en Agenda</Link>}
              <button type="button" className="btn btn-ghost" disabled={busy} aria-expanded={editingId === session.id}
                aria-label={`${session.callDeadline ? "Configurar recordatorio" : "Editar actividad"}: ${session.title}`}
                onClick={event => {
                  if (editingId === session.id) { closeEditor(); return; }
                  editTrigger.current = event.currentTarget;
                  setEditingId(session.id); setEditError(""); setEditNotice("");
                }}>
                {session.callDeadline ? <Bell size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
                {session.callDeadline ? "Recordatorio" : "Editar"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPendingDelete(session); setRemovalScope("single"); }} disabled={busy} aria-label={`Retirar de Agenda: ${session.title}`}>Retirar</button>
            </div>
            {editingId === session.id && <TeachingSessionEditor key={session.id} session={session} busy={busy} error={editError} notice={editNotice}
              onSave={(item, values) => void saveChanges(item, values)} onReminder={(item, minutes) => void saveReminder(item, minutes)} onClose={closeEditor} />}
            {!session.callDeadline && <AcademicSessionContent sessionId={session.id} title={session.title} content={session.content} contentRevision={session.contentRevision}
              busy={busy} onDirtyChange={trackContentDraft} onSave={(expectedRevision, content) => saveContent(session.id, expectedRevision, content)} />}
          </li>)}
        </ul>}
        {sessions.length > 0 && <a href={`${endpoint}/export`} className="btn btn-ghost"><Download size={16} aria-hidden="true" /> Descargar agenda (.ics)</a>}
      </>}
    <AcademicCalendarSubscription workspaceId={workspaceId} />
    <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title="Retirar actividad de la Agenda">
      {pendingDelete && <p className="text-sm text-[var(--muted)]">Se retirará «{pendingDelete.title}» de tu Agenda.</p>}
      {pendingDelete?.series && <fieldset className={styles.removalChoices} disabled={busy}>
        <legend className="text-sm font-semibold">Sesiones que quieres retirar</legend>
        <label><input type="radio" name="teaching-removal" checked={removalScope === "single"} onChange={() => setRemovalScope("single")} /> Sólo esta sesión</label>
        <label><input type="radio" name="teaching-removal" checked={removalScope === "following"} onChange={() => setRemovalScope("following")} /> Esta sesión y las siguientes</label>
      </fieldset>}
      {pendingDelete && !pendingDelete.callDeadline && <p className="mt-2 text-sm text-[var(--muted)]">También se quitarán las lecturas, los materiales y los resultados de las sesiones retiradas.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setPendingDelete(null)}>Cancelar</Button>
        <Button variant="danger" loading={busy} onClick={() => void remove()}>{removalScope === "following" ? "Retirar sesiones" : "Retirar"}</Button>
      </div>
    </Dialog>
  </section>;
}
