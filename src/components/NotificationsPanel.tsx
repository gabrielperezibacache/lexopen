"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { needsNotificationAcknowledgment, NOTIFICATION_INBOX_CHANGED, type NotificationInbox, type NotificationListItem } from "@/lib/notify/inbox";

export function NotificationsPanel({ initial }: { initial: NotificationInbox }) {
  const router = useRouter();
  const { locale } = useI18n();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const [updated, setUpdated] = useState<{ base: NotificationInbox; inbox: NotificationInbox } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { items, unreadCount: unread } = updated?.base === initial ? updated.inbox : initial;

  function apply(items: NotificationListItem[], unreadCount: number) {
    setUpdated({ base: initial, inbox: { items, unreadCount } });
    window.dispatchEvent(new Event(NOTIFICATION_INBOX_CHANGED));
    router.refresh();
  }

  async function markRead(id?: string) {
    if (loadingAction !== null) return;
    setLoadingAction(id ?? "all");
    setError("");
    try {
      const result = await apiMutation<{ unreadCount: number }>("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { action: "read-all" }),
      });
      if (!result.ok) { setError(result.error); return; }
      apply(items.map(n => !id || n.id === id ? { ...n, read: true } : n), result.data.unreadCount);
    } finally {
      setLoadingAction(null);
    }
  }

  async function ackOne(n: NotificationListItem) {
    setLoadingAction(`ack-${n.id}`);
    setError("");
    try {
      const result = await apiMutation("/api/notify/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: n.id,
          plazoId: n.entityType === "plazo" ? n.entityId : undefined,
          via: "inapp",
        }),
      });
      if (!result.ok) { setError(result.error); return; }
      apply(
        items.map((x) =>
          x.id === n.id
            ? { ...x, ackAt: new Date().toISOString(), read: true }
            : x
        ),
        n.read || unread >= 100 ? unread : Math.max(0, unread - 1),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={tr("Aún no tienes avisos", "You have no notifications yet")}
        description={tr("Aquí podrás volver a los avisos que recibas en LexOpen.", "You can find your LexOpen notifications here.")}
        actionLabel={tr("Configurar notificaciones", "Notification settings")}
        actionHref="/cuenta/notificaciones"
        symbol="evidence"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/70">
          {unread > 0 ? tr(`${unread > 99 ? "99+" : unread} sin leer`, `${unread > 99 ? "99+" : unread} unread`) : tr("Todas leídas", "All read")}
        </p>
        {unread > 0 && (
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loadingAction !== null}
            onClick={() => void markRead()}
          >
            {loadingAction === "all" ? tr("Marcando…", "Marking…") : tr("Marcar todas como leídas", "Mark all as read")}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="space-y-3">
        {items.map((n) => (
          <article
            key={n.id}
            className={`panel rounded-3xl p-5 ${
              n.read ? "" : "border border-[var(--copper)]/35 bg-[var(--copper-soft)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <h2 className="font-semibold">{n.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{n.body}</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  {formatDateTime(n.createdAt, locale)} · {n.read ? tr("Leída", "Read") : tr("Sin leer", "Unread")}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {needsNotificationAcknowledgment(n) && (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={loadingAction !== null}
                      onClick={() => ackOne(n)}
                    >
                      {loadingAction === `ack-${n.id}`
                        ? tr("Confirmando…", "Confirming…")
                        : tr("Acusar recibo", "Acknowledge")}
                    </button>
                  )}
                {n.ackAt && (
                  <span className="self-center text-xs text-[var(--sea)]">
                    {tr("Acuse registrado", "Acknowledged")}
                  </span>
                )}
                {!n.read && (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void markRead(n.id)}
                  >
                    {loadingAction === n.id ? tr("Marcando…", "Marking…") : tr("Marcar leída", "Mark as read")}
                  </button>
                )}
                {n.href && (
                  <Link className="btn btn-secondary" href={n.href} onNavigate={() => { if (!n.read) void markRead(n.id); }}>
                    {tr("Abrir", "Open")}
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
