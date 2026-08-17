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
    <div>
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
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="panel rounded-3xl p-5">
          <h2 className="font-semibold">Bandeja</h2>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto">
            {messages.length === 0 && (
              <EmptyState
                title="Bandeja vacía"
                description="Envíe el primer mensaje a un colega o al canal del portal."
              />
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
              >
                <div className="font-medium">{m.subject || "(sin asunto)"}</div>
                <div className="text-xs text-[var(--ink-soft)]/60">
                  {m.sender.name} → {m.receiver.name}
                </div>
                <p className="mt-1 text-[var(--ink-soft)]/85">{m.body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="panel rounded-3xl p-5">
          <h2 className="font-semibold">Nuevo mensaje</h2>
          <MensajeBorradorAi
            onApply={(draft) => {
              setSubject(draft.subject);
              setBody(draft.body);
            }}
          />
          <form onSubmit={send} className="mt-4 space-y-2">
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
            <input
              className="input"
              name="subject"
              placeholder="Asunto"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="textarea"
              name="body"
              required
              placeholder="Mensaje"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
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
