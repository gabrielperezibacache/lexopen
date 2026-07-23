"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleHeader } from "@/components/sites/SiteNav";

type Msg = {
  id: string;
  subject: string | null;
  body: string;
  createdAt: string;
  sender: { id: string; name: string };
  receiver: { id: string; name: string };
};
type Notif = { id: string; title: string; body: string; read: boolean; href: string | null };
type User = { id: string; name: string; email: string };

export default function MessagesPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  async function load() {
    const [m, n, me] = await Promise.all([
      fetch("/api/messages").then((r) => r.json()),
      fetch("/api/notifications").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]);
    setMessages(m);
    setNotifs(n);
    setUsers(me.users || []);
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
        subject: fd.get("subject"),
        body: fd.get("body"),
      }),
    });
    e.currentTarget.reset();
    load();
  }

  async function markRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    });
    load();
  }

  return (
    <div>
      <ModuleHeader
        eyebrow="Secure messaging"
        title="Messages"
        subtitle="Mensajería interna + centro de notificaciones (HighQ activity / alerts)."
        actions={
          <button className="btn btn-ghost" type="button" onClick={markRead}>
            Marcar notificaciones leídas
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="font-semibold">Bandeja</h2>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto">
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
          <form onSubmit={send} className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
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
            <input className="input" name="subject" placeholder="Asunto" />
            <textarea className="textarea" name="body" required placeholder="Mensaje" />
            <button className="btn btn-primary" type="submit">
              Enviar
            </button>
          </form>
        </section>
        <section className="panel rounded-3xl p-5">
          <h2 className="font-semibold">Notificaciones</h2>
          <div className="mt-4 space-y-3">
            {notifs.map((n) => (
              <a
                key={n.id}
                href={n.href || "#"}
                className={`block rounded-2xl border px-3 py-2 text-sm ${
                  n.read ? "border-[var(--line)] opacity-70" : "border-[var(--copper)]/40 bg-[rgba(196,122,58,0.06)]"
                }`}
              >
                <div className="font-medium">{n.title}</div>
                <div className="text-[var(--ink-soft)]/75">{n.body}</div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
