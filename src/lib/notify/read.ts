import type { Prisma } from "@prisma/client";
import { notificationActor, visibleNotificationSubjects } from "@/lib/notify/access";
import { notificationListItem } from "@/lib/notify/inbox";

/** Paginate across inaccessible records instead of letting them hide newer visible notices. */
export async function visibleNotifications(userId: string, tx: Prisma.TransactionClient, limit = 30, { unreadOnly = false } = {}) {
  const actor = await notificationActor(userId, tx);
  if (!actor || limit < 1) return [];
  const items = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await tx.notification.findMany({ where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    items.push(...await visibleNotificationSubjects(actor, page, tx));
    if (items.length >= limit) return items.slice(0, limit);
    cursor = page[page.length - 1].id;
    if (page.length < 100) break;
  }
  return items;
}

/** The shell shows at most 99+ and counts only notices the user can still read. */
export async function visibleUnreadNotifications(userId: string, tx: Prisma.TransactionClient) {
  return (await visibleNotifications(userId, tx, 100, { unreadOnly: true })).length;
}

export async function notificationInbox(userId: string, tx: Prisma.TransactionClient, limit: number) {
  const [items, unreadCount] = await Promise.all([
    visibleNotifications(userId, tx, limit), visibleUnreadNotifications(userId, tx),
  ]);
  return { items: items.map(notificationListItem), unreadCount };
}
