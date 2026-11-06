import type { Notification } from "@prisma/client";
import { safeAppPath } from "@/lib/auth/safe-next";

export const NOTIFICATION_INBOX_CHANGED = "lexopen-notification-inbox-changed";

export function notificationListItem(notice: Notification) {
  return {
    id: notice.id, title: notice.title, body: notice.body, read: notice.read,
    href: safeAppPath(notice.href, "") || null,
    createdAt: notice.createdAt.toISOString(), ackAt: notice.ackAt?.toISOString() ?? null,
    tipo: notice.tipo, severidad: notice.severidad, entityType: notice.entityType, entityId: notice.entityId,
  };
}

export type NotificationListItem = ReturnType<typeof notificationListItem>;
export type NotificationInbox = { items: NotificationListItem[]; unreadCount: number };

export function needsNotificationAcknowledgment(notice: Pick<NotificationListItem, "tipo" | "severidad" | "ackAt">) {
  return !notice.ackAt && (notice.tipo === "plazo.fatal" || notice.tipo === "plazo.fatal.escalamiento" || notice.severidad === "critica");
}
