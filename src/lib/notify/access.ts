import type { Prisma } from "@prisma/client";
import { minutaConfidentialWhere } from "@/lib/api";
import { canSome } from "@/lib/auth/permissions";
import { causaAccessWhere, documentReadWhere, plazoAccessWhere, taskAccessWhere } from "@/lib/auth/causa-access";

export type NotificationSubject = {
  entityType?: string | null;
  entityId?: string | null;
  causaId?: string | null;
  href?: string | null;
};

/** Resolve the original resource again: memberships may change while mail is queued. */
export async function notificationCausa(
  subject: NotificationSubject,
  tx: Prisma.TransactionClient
): Promise<{ exists: boolean; causaId: string | null }> {
  const id = subject.entityId;
  const type = subject.entityType?.toLowerCase();
  if (id && type === "causa") return { exists: true, causaId: id };
  if (id && ["plazo", "minuta", "tramite", "documento"].includes(type || "")) {
    const resource = type === "plazo"
      ? await tx.plazo.findUnique({ where: { id }, select: { causaId: true } })
      : type === "minuta"
        ? await tx.minuta.findUnique({ where: { id }, select: { causaId: true } })
        : type === "tramite"
          ? await tx.tramite.findUnique({ where: { id }, select: { causaId: true } })
          : await tx.documento.findUnique({ where: { id }, select: { causaId: true } });
    return { exists: Boolean(resource), causaId: resource?.causaId || null };
  }
  if (id && type === "task") {
    const task = await tx.task.findUnique({
      where: { id }, select: { causaId: true, site: { select: { causaId: true } } },
    });
    return { exists: Boolean(task), causaId: task?.causaId || task?.site?.causaId || null };
  }
  const legacyCase = subject.href?.match(/^\/causas\/([^/?#]+)(?:[/?#]|$)/)?.[1];
  return { exists: true, causaId: subject.causaId || legacyCase || null };
}

export async function canReceiveNotification(
  userId: string,
  subject: NotificationSubject,
  tx: Prisma.TransactionClient
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!user) return false;
  const type = subject.entityType?.toLowerCase(), id = subject.entityId;
  if (id && type === "documento" && !await tx.documento.findFirst({ where: { id, ...documentReadWhere(user) }, select: { id: true } })) return false;
  if (id && type === "plazo" && !await tx.plazo.findFirst({ where: { id, ...plazoAccessWhere(user) }, select: { id: true } })) return false;
  if (id && type === "minuta" && !await tx.minuta.findFirst({ where: { id, ...minutaConfidentialWhere(user) }, select: { id: true } })) return false;
  if (id && type === "task" && !await tx.task.findFirst({ where: { AND: [{ id }, taskAccessWhere(user)] }, select: { id: true } })) return false;
  if (id && type === "message") {
    if (!canSome(user, "client.message")) return false;
    return Boolean(await tx.message.findFirst({ where: { id, receiverId: userId }, select: { id: true } }));
  }
  const resource = await notificationCausa(subject, tx);
  if (!resource.exists) return false;
  if (!resource.causaId) return true;
  return Boolean(await tx.causa.findFirst({
    where: { AND: [{ id: resource.causaId }, causaAccessWhere(user)] },
    select: { id: true },
  }));
}
