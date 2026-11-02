"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { EmptyState } from "@/components/EmptyState";
import { apiMutation } from "@/lib/api-mutation";
import { MensajeBorradorAi } from "@/components/ai/MensajeBorradorAi";

type Msg = {
  id: string;
  subject: string | null;
  body: string;
  createdAt: string;
  sender: { id: string; name: string };
  receiver: { id: string; name: string };
};
type User = { id: string; name: string; email: string; role?: string };

export function MessagesClient({
  initialMessages,
  directory,
}: {
  initialMessages: Msg[];
  directory: User[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function refresh() {
    const res = await fetch("/api/messages");
    const m = await res.json().catch(() => []);
    setMessages(Array.isArray(m) ? m : []);
    router.refresh();
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const result = await apiMutation("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: fd.get("receiverId"),
          subject: subject || fd.get("subject"),
          body: body || fd.get("body"),
        }),
      });
      if (!result.ok) {
        setError(result.error || "No se pudo enviar el mensaje");
        return;
      }
      form.reset();
      setSubject("");
      setBody("");
      await refresh();
    } catch {
      setError("No se pudo enviar el mensaje");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Mensajería"
        title="Mensajes"
        subtitle="Bandeja del estudio y canal staff↔cliente acotado a miembros del portal (sin chat libre global)."
        actions={
          <Link href="/notificaciones" className="btn btn-ghost">
            Ir a notificaciones
          </Link>
        }
      />
      {error && (
        <p
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {messages.length === 0 ? (
              <EmptyState
                title="Bandeja vacía"
                description="Envíe el primer mensaje a un colega o al canal del portal."
              />
        ) : (
        <section className="panel min-w-0 overflow-hidden rounded-[var(--radius-lg)]">
          <h2 className="border-b border-[var(--line)] px-5 py-4 text-lg font-semibold">Bandeja</h2>
          <div className="max-h-[min(70vh,48rem)] divide-y divide-[var(--line)] overflow-auto">
            {messages.map((m) => (
              <article
                key={m.id}
                className="min-w-0 px-5 py-5 text-sm"
              >
                <h3 className="break-words font-semibold">{m.subject || "(sin asunto)"}</h3>
                <div className="mt-2 break-words text-xs leading-relaxed text-[var(--muted)]">
                  {m.sender.name} → {m.receiver.name}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-[var(--ink-soft)]">{m.body}</p>
              </article>
            ))}
          </div>
        </section>
        )}
        <section className="panel min-w-0 rounded-[var(--radius-lg)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Nuevo mensaje</h2>
          <MensajeBorradorAi
            onApply={(draft) => {
              setSubject(draft.subject);
              setBody(draft.body);
            }}
          />
          <form onSubmit={send} className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Destinatario</span>
            <select className="select" name="receiverId" required defaultValue="">
              <option value="" disabled>
                Destinatario
              </option>
              {directory.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.role ? ` · ${u.role}` : ""}
                </option>
              ))}
            </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Asunto</span>
            <input
              className="input"
              name="subject"
              placeholder="Asunto"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Mensaje</span>
            <textarea
              className="textarea"
              name="body"
              required
              placeholder="Mensaje"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            </label>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || directory.length === 0}
            >
              {busy ? "Enviando…" : "Enviar"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
