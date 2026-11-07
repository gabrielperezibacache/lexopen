"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ConfirmDialog } from "@/components/ui";
import type { TeachingSession } from "@/lib/altazor/teaching-sessions";
import { SANTIAGO_TZ } from "@/lib/chile-time";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { academicApi } from "./academic-ui";

const time = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, dateStyle: "medium", timeStyle: "short" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "No se pudo actualizar la Agenda.";

export function AcademicTeachingSessions({ workspaceId }: { workspaceId: string }) {
  const [sessions, setSessions] = useState<TeachingSession[] | null>(null);
  const [title, setTitle] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TeachingSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = useRef(createSubmissionKeys(undefined, `altazor:teaching:${workspaceId}`));
  const section = useRef<HTMLElement>(null);
  const endpoint = `/api/altazor/academic/${encodeURIComponent(workspaceId)}/teaching-sessions`;

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

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim() || !startsAtLocal) return;
    const input = { title: title.trim(), startsAtLocal, ...(endsAtLocal ? { endsAtLocal } : {}) };
    setBusy(true); setError(""); setNotice("");
    try {
      const { session } = await academicApi<{ session: TeachingSession }>(endpoint, { ...input, requestId: key.current.forPayload(input) });
      key.current.complete(input);
      setSessions(current => [...(current || []).filter(item => item.id !== session.id), session].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setTitle(""); setStartsAtLocal(""); setEndsAtLocal("");
      setNotice("Actividad agregada a tu Agenda de LexOpen.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!pendingDelete || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await academicApi(`${endpoint}/${encodeURIComponent(pendingDelete.id)}`, {}, "DELETE");
      setSessions(current => current?.filter(item => item.id !== pendingDelete.id) || []);
      setNotice("Actividad retirada de tu Agenda.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setPendingDelete(null); setBusy(false); }
  }

  return <section ref={section} id="agenda-docencia" aria-labelledby="agenda-docencia-heading" className="scroll-mt-28 space-y-4 border-t border-[var(--line)] pt-5">
    <div>
      <h2 id="agenda-docencia-heading" className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} aria-hidden="true" /> Actividades en mi Agenda</h2>
      <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">Registra clases, sesiones y fechas de este trabajo en tu Agenda interna de LexOpen. Usa la hora de Santiago de Chile.</p>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
    {sessions === null ? error
      ? <button type="button" className="btn btn-outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Volver a cargar actividades</button>
      : <p role="status">Cargando tus actividades…</p>
      : <>
        <form onSubmit={schedule} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">Nombre de la actividad<input className="input min-w-0" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} disabled={busy} /></label>
          <label>Inicio<input className="input min-w-0" type="datetime-local" value={startsAtLocal} onChange={event => setStartsAtLocal(event.target.value)} required disabled={busy} /></label>
          <label>Término (opcional)<input className="input min-w-0" type="datetime-local" value={endsAtLocal} onChange={event => setEndsAtLocal(event.target.value)} disabled={busy} /></label>
          <button type="submit" className="btn btn-outline justify-self-start" disabled={busy || !title.trim() || !startsAtLocal}>Agregar a mi Agenda</button>
        </form>
        {sessions.length > 0 && <ul className="space-y-2">
          {sessions.map(session => <li key={session.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] py-3">
            <div className="min-w-0 flex-1 break-words"><strong>{session.title}</strong><p className="mt-1 text-sm text-[var(--ink-soft)]"><time dateTime={session.startsAt}>{time.format(new Date(session.startsAt))}</time>{session.endsAt && <> – <time dateTime={session.endsAt}>{time.format(new Date(session.endsAt))}</time></>}</p></div>
            <Link className="btn btn-ghost" href={session.agendaHref}>Ver en Agenda</Link>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(session)} disabled={busy} aria-label={`Retirar de Agenda: ${session.title}`}>Retirar</button>
          </li>)}
        </ul>}
      </>}
    <ConfirmDialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} onConfirm={() => void remove()}
      title="Retirar actividad de la Agenda" description={pendingDelete ? `Se retirará «${pendingDelete.title}» de tu Agenda.` : ""} confirmLabel="Retirar" busy={busy} />
  </section>;
}
