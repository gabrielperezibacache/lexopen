"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { apiMutation } from "@/lib/api-mutation";

type Notif = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  href: string | null;
  createdAt: string | Date;
};

export function NotificationsPanel({ initial }: { initial: Notif[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read).length;

  async function markOne(id: string) {
    const result = await apiMutation("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!result.ok) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    router.refresh();
  }

  async function markAll() {
    const result = await apiMutation("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    });
    if (!result.ok) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Bandeja vacía"
        description="Cuando le asignen tareas, minutas o movimientos, aparecerán aquí."
        actionLabel="Ir a tareas"
        actionHref="/tareas"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/70">
          {unread > 0 ? `${unread} sin leer` : "Todas leídas"}
        </p>
        {unread > 0 && (
          <button className="btn btn-secondary" type="button" onClick={markAll}>
            Marcar todas como leídas
          </button>
        )}
      </div>
      <div className="space-y-3">
        {items.map((n) => (
          <article
            key={n.id}
            className={`panel rounded-3xl p-5 ${
              n.read ? "" : "border border-[var(--copper)]/35 bg-[rgba(196,122,58,0.05)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{n.title}</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{n.body}</p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]/60">
                  {formatDateTime(n.createdAt)} · {n.read ? "leída" : "pendiente"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!n.read && (
                  <button className="btn btn-ghost" type="button" onClick={() => markOne(n.id)}>
                    Marcar leída
                  </button>
                )}
                {n.href && (
                  <Link className="btn btn-secondary" href={n.href} onClick={() => markOne(n.id)}>
                    Abrir
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
