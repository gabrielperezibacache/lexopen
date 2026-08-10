"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { EmptyState } from "@/components/EmptyState";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

type Msg = {
  id: string;
  subject: string | null;
  body: string;
  createdAt: string;
  sender: { id: string; name: string };
  receiver: { id: string; name: string };
};
type User = { id: string; name: string; email: string };

export default function MessagesPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    const [m, me] = await Promise.all([
      fetch("/api/messages").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]);
    setMessages(Array.isArray(m) ? m : []);
    setUsers(me.users || []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverId: fd.get("receiverId"),
        subject: subject || fd.get("subject"),
        body: body || fd.get("body"),
      }),
    });
    e.currentTarget.reset();
    setSubject("");
    setBody("");
    load();
  }

  function applyAiDraft(result: AiActionResponse) {
    const data = result.data as { asunto?: string; cuerpo?: string } | null;
    if (data?.asunto) setSubject(data.asunto);
    if (data?.cuerpo) setBody(data.cuerpo);
  }

  return (
    <div>
      <ModuleHeader
        eyebrow="Mensajería interna"
        title="Mensajes"
        subtitle="Bandeja segura del estudio. Las alertas del sistema están en Notificaciones."
        actions={
          <Link href="/notificaciones" className="btn btn-ghost">
            Ir a notificaciones
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="panel rounded-3xl p-5">
          <h2 className="font-semibold">Bandeja</h2>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto">
            {loaded && messages.length === 0 && (
              <EmptyState
                title="Bandeja vacía"
                description="Envíe el primer mensaje a un colega del estudio."
              />
            )}
            {messages.map((m) => (
              <div key={m.id} className="rounded-2xl border border-[var(--line)] px-3 py-2 text-sm">
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
          <form onSubmit={send} className="mt-4 space-y-2">
            <AiAssist
              action="mensaje.borrador"
              label="Borrador IA"
              showPreview={false}
              onResult={applyAiDraft}
            />
            <select className="select" name="receiverId" required defaultValue="">
              <option value="" disabled>
                Destinatario
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
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
            <button className="btn btn-primary" type="submit">
              Enviar
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
