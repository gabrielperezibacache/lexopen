"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import type { FeedbackItem, FeedbackPage } from "@/lib/feedback/service";

export function FeedbackPanel({ initial, locale }: { initial: FeedbackPage; locale: "es" | "en" }) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const categories = {
    sugerencia: tr("Sugerencia", "Suggestion"),
    error: tr("Problema", "Problem"),
    otro: tr("Otro", "Other"),
  };
  const statuses = {
    nuevo: tr("Recibido", "Received"),
    en_revision: tr("En revisión", "In review"),
    resuelto: tr("Resuelto", "Resolved"),
  };
  const [items, setItems] = useState(initial.feedback);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const submission = useRef(createSubmissionKeys());
  const date = new Intl.DateTimeFormat(locale === "en" ? "en" : "es-CL", { dateStyle: "medium", timeZone: "America/Santiago" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      category: String(data.get("category") ?? ""),
      title: String(data.get("title") ?? "").trim(),
      details: String(data.get("details") ?? "").trim(),
    };
    setBusy(true);
    setError("");
    setNotice("");
    const result = await apiMutation<{ feedback: FeedbackItem }>("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requestId: submission.current.forPayload(payload) }),
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    submission.current.complete(payload);
    form.reset();
    setItems(previous => [result.data.feedback, ...previous.filter(item => item.id !== result.data.feedback.id)]);
    setNotice(tr("Comentario recibido. Puedes seguir su estado aquí.", "Feedback received. You can follow its status here."));
  }

  async function changeStatus(id: string, status: FeedbackItem["status"]) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await apiMutation<{ feedback: FeedbackItem }>("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setItems(previous => previous.map(item => item.id === id ? result.data.feedback : item));
    setNotice(tr("Estado actualizado.", "Status updated."));
  }

  async function loadOlder() {
    if (!cursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/feedback?${new URLSearchParams({ before: cursor })}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const page: FeedbackPage = await response.json();
      setItems(previous => [...previous, ...page.feedback.filter(item => !previous.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch {
      setError(tr("No se pudieron cargar más comentarios. Intenta de nuevo.", "More feedback could not be loaded. Try again."));
    } finally { setBusy(false); }
  }

  return <div className="max-w-3xl space-y-8">
    <form data-feedback-form onSubmit={submit} className="panel space-y-4 p-4 sm:p-6" aria-label={tr("Enviar comentario", "Send feedback")} aria-busy={busy}>
      <h2 className="text-lg font-semibold">{tr("Nuevo comentario", "New feedback")}</h2>
      <label className="grid gap-2 text-sm font-medium">
        <span>{tr("Tipo de comentario", "Feedback type")}</span>
        <select className="input w-full sm:max-w-xs" name="category" required disabled={busy}>
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{tr("Título", "Title")}</span>
        <input className="input w-full" name="title" placeholder={tr("Resume el comentario", "Summarize your feedback")} required maxLength={120} disabled={busy} />
      </label>
      <div className="grid gap-2 text-sm">
        <label className="font-medium" htmlFor="feedback-details">{tr("Descripción", "Description")}</label>
        <p id="feedback-privacy" className="text-[var(--ink-soft)]">
          {tr("Lo revisará la administración del estudio. Usa ejemplos ficticios y omite datos reservados.", "Your firm's administrators will review this. Use fictitious examples and leave out confidential information.")}
        </p>
        <textarea className="input w-full" id="feedback-details" name="details" rows={4} placeholder={tr("Cuéntanos qué ocurrió o qué te gustaría mejorar", "Tell us what happened or what you would like to improve")} required maxLength={3000} disabled={busy} aria-describedby="feedback-privacy" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{tr("Enviar comentario", "Send feedback")}</button>
    </form>

    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}

    <section className="space-y-3" aria-labelledby="feedback-history">
      <h2 id="feedback-history" className="text-lg font-semibold">{initial.canManage ? tr("Comentarios del equipo", "Team feedback") : tr("Mis comentarios", "My feedback")}</h2>
      {items.length === 0 ? <div className="flex items-center gap-3 border-y border-[var(--line)] py-4">
        <FolioSymbol variant="evidence" className="size-10 shrink-0 text-[var(--sea)]" />
        <p className="text-sm text-[var(--ink-soft)]">
          {tr("Todavía no hay comentarios. Cuando envíes uno, podrás seguir su estado aquí.", "There is no feedback yet. When you submit something, you can follow its status here.")}
        </p>
      </div> :
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {items.map(item => <li key={item.id} className="space-y-2 py-4 wrap-anywhere">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-semibold">{item.title}</h3>
              <span className="text-sm font-medium text-[var(--sea)]">{statuses[item.status]}</span>
            </div>
            <p className="text-sm text-[var(--ink-soft)]">
              {categories[item.category]} · <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time>{item.author ? ` · ${item.author.name}` : ""}
            </p>
            <p className="whitespace-pre-wrap">{item.details}</p>
            {initial.canManage && <div className="flex flex-wrap gap-2">
              {item.status !== "en_revision" && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void changeStatus(item.id, "en_revision")}>
                {item.status === "resuelto" ? tr("Reabrir", "Reopen") : tr("Marcar en revisión", "Mark in review")}
              </button>}
              {item.status !== "resuelto" && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void changeStatus(item.id, "resuelto")}>{tr("Marcar resuelto", "Mark resolved")}</button>}
            </div>}
          </li>)}
        </ul>}
      {cursor && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void loadOlder()}>{tr("Ver comentarios anteriores", "Load older feedback")}</button>}
    </section>
  </div>;
}
