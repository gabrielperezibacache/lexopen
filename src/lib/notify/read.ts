import type { Prisma } from "@prisma/client";
import { canReceiveNotification } from "@/lib/notify/access";

/** Paginate across inaccessible records instead of letting them hide newer visible notices. */
export async function visibleNotifications(userId: string, tx: Prisma.TransactionClient, limit = 30) {
  const items = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await tx.notification.findMany({ where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    for (const notice of page) {
      if (await canReceiveNotification(userId, notice, tx)) items.push(notice);
      if (items.length >= limit) return items;
    }
    cursor = page[page.length - 1].id;
    if (page.length < 100) break;
  }
  return items;
}
