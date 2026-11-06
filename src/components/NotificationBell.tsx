"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, Check } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDateTime } from "@/components/ui";
import { Sheet } from "@/components/ui/Sheet";
import { apiMutation } from "@/lib/api-mutation";
import { needsNotificationAcknowledgment, NOTIFICATION_INBOX_CHANGED, type NotificationInbox } from "@/lib/notify/inbox";

export function NotificationBell() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const dialogId = useId(), request = useRef<AbortController | null>(null), writing = useRef(false);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preview, setPreview] = useState<NotificationInbox["items"] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async (showPreview: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`/api/notifications?view=${showPreview ? "preview" : "count"}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Notification inbox unavailable");
      const data = await response.json() as NotificationInbox;
      if (!Number.isInteger(data.unreadCount) || data.unreadCount < 0 || (showPreview && !Array.isArray(data.items))) throw new Error("Invalid notification inbox");
      if (controller.signal.aborted) return;
      setUnreadCount(data.unreadCount);
      if (showPreview) { setPreview(data.items); setLoadError(false); }
    } catch {
      if (showPreview && !controller.signal.aborted) { setPreview(null); setLoadError(true); }
    }
  }, []);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(open); };
    refreshVisible();
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener(NOTIFICATION_INBOX_CHANGED, refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener(NOTIFICATION_INBOX_CHANGED, refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      request.current?.abort();
    };
  }, [open, refresh]);

  async function markRead(id?: string) {
    if (writing.current) return;
    writing.current = true;
    setPending(id ?? "all");
    setSaveError(false);
    const result = await apiMutation<{ unreadCount: number }>("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { action: "read-all" }),
    });
    if (result.ok) {
      setUnreadCount(result.data.unreadCount);
      setPreview(current => current?.map(item => !id || item.id === id ? { ...item, read: true } : item) ?? null);
      window.dispatchEvent(new Event(NOTIFICATION_INBOX_CHANGED));
      router.refresh();
    } else setSaveError(true);
    writing.current = false;
    setPending(null);
  }

  const count = unreadCount > 99 ? "99+" : String(unreadCount);
  const title = t("nav.notifications");
  const unread = tr(`${count} sin leer`, `${count} unread`);
  return <>
    <button type="button" className="shell-icon-button relative shrink-0" aria-label={unreadCount ? `${title} · ${unread}` : title}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
      onClick={() => { setPreview(null); setLoadError(false); setSaveError(false); setOpen(true); }}>
      <Bell size={18} aria-hidden="true" />
      {unreadCount > 0 && <span aria-hidden="true" className="shell-nav-count absolute -right-1 -top-1">{count}</span>}
    </button>
    <Sheet id={dialogId} open={open} onClose={() => setOpen(false)} title={title}>
      <div className="space-y-4">
        {loadError ? <div className="space-y-2">
          <p role="alert" className="text-sm text-[var(--danger)]">{tr("No pudimos cargar tus notificaciones.", "We couldn't load your notifications.")}</p>
          <button className="btn btn-secondary" type="button" onClick={() => void refresh(true)}>{tr("Volver a intentar", "Try again")}</button>
        </div> : !preview ? <p role="status" className="text-sm text-[var(--muted)]">{tr("Cargando notificaciones…", "Loading notifications…")}</p> : preview.length === 0 ? <div className="space-y-1 py-3">
          <p className="font-semibold">{tr("Aún no tienes notificaciones", "You have no notifications yet")}</p>
          <p className="text-sm leading-relaxed text-[var(--muted)]">{tr("Aquí verás avisos de plazos, tareas y cambios en tus causas.", "Deadline, task and case updates will appear here.")}</p>
        </div> : <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-[var(--muted)]" role="status">{unreadCount ? unread : tr("Todas leídas", "All read")}</p>
            {unreadCount > 0 && <button type="button" className="btn btn-ghost text-sm" disabled={pending !== null} onClick={() => void markRead()}>{tr("Marcar todas como leídas", "Mark all as read")}</button>}
          </div>
          {saveError && <p role="alert" className="text-sm text-[var(--danger)]">{tr("No pudimos confirmar el cambio. Vuelve a intentarlo.", "We couldn't confirm the change. Try again.")}</p>}
          <ul aria-label={tr("Avisos recientes", "Recent notifications")} className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {preview.map(item => <li key={item.id} className="min-w-0 py-3 [overflow-wrap:anywhere]">
              <div className="flex items-start gap-2.5">
                <span className="mt-2 size-2 shrink-0 rounded-full" style={{ backgroundColor: item.read ? "transparent" : "var(--sea)" }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={item.read ? "font-medium" : "font-semibold"}>{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--ink-soft)]">{item.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--muted)]">
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, locale)}</time>
                    {!item.read && <span className="text-[var(--sea)]">{tr("Sin leer", "Unread")}</span>}
                    {needsNotificationAcknowledgment(item) && <span className="text-[var(--warn)]">{tr("Pendiente de acuse", "Acknowledgment pending")}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3">
                    {item.href && <Link href={item.href} aria-label={tr(`Abrir · ${item.title}`, `Open · ${item.title}`)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline" onNavigate={() => setOpen(false)}>{tr("Abrir", "Open")}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
                    {!item.read && <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--ink-soft)] underline-offset-4 hover:underline disabled:opacity-60" disabled={pending !== null} onClick={() => void markRead(item.id)} aria-label={tr(`Marcar como leída · ${item.title}`, `Mark as read · ${item.title}`)}><Check size={15} aria-hidden="true" />{tr("Marcar como leída", "Mark as read")}</button>}
                  </div>
                </div>
              </div>
            </li>)}
          </ul>
        </>}
        <Link href="/notificaciones" className="btn btn-secondary w-full" onNavigate={() => setOpen(false)}>{tr("Ver todas las notificaciones", "View all notifications")}</Link>
      </div>
    </Sheet>
  </>;
}
