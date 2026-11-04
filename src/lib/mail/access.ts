import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import {
  assertCausaCapability,
  causaAccessWhere,
  documentReadWhere,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { publicMailboxMessage } from "./types";

export type MailAccessClient = Pick<Prisma.TransactionClient, "user" | "causa" | "documento" | "auditEvent">;
type OwnedMailMessage = Parameters<typeof publicMailboxMessage>[0] & { userId: string };

/** Cron and long-running imports must not keep an old role or omit capability revocations. */
export async function currentMailActor(user: CausaAccessUser, client: MailAccessClient = prisma) {
  const actor = await client.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!actor || !isStaff(actor.role)) throw httpError("No tiene permiso para acceder al correo", 403);
  return actor;
}

/** Selectable associations inherit the current matter wall, including active memberships. */
export function causaMailWhere(user: CausaAccessUser): Prisma.CausaWhereInput {
  return { AND: [{ estado: { not: "archivada" } }, causaAccessWhere(user)] };
}

export async function assertCausaMailAccess(
  user: CausaAccessUser,
  causaId: string,
  options: { write?: boolean } = {},
  client: MailAccessClient = prisma
) {
  const actor = await currentMailActor(user, client);
  const causa = await client.causa.findFirst({
    where: { AND: [{ id: causaId }, causaMailWhere(actor)] },
    select: { id: true },
  });
  if (!causa) throw httpError("Causa no encontrada o sin permiso", 404);
  if (options.write) await assertCausaCapability(causaId, actor, "causa.write", client);
  return causa;
}

/**
 * The original belongs to its recipient. Only live, authorized relations are
 * projected onto it; a stale stored association never becomes a matter reader.
 */
export async function publicMailboxMessages(
  messages: OwnedMailMessage[],
  user: CausaAccessUser,
  client: MailAccessClient = prisma
) {
  if (messages.some(message => message.userId !== user.id)) throw httpError("Mensaje no encontrado", 404);
  const actor = await currentMailActor(user, client);
  const causaIds = [...new Set(messages.flatMap(message => message.causaId ? [message.causaId] : []))];
  const documentIds = [...new Set(messages.flatMap(message => (message.attachments || []).flatMap(attachment => attachment.documentoId ? [attachment.documentoId] : [])))];
  const [causas, documents] = await Promise.all([
    causaIds.length ? client.causa.findMany({
      where: { AND: [{ id: { in: causaIds } }, causaAccessWhere(actor)] },
      select: { id: true, titulo: true, rit: true },
    }) : [],
    documentIds.length ? client.documento.findMany({
      where: { AND: [{ id: { in: documentIds } }, documentReadWhere(actor)] },
      select: { id: true },
    }) : [],
  ]);
  const allowedCausas = new Map(causas.map(causa => [causa.id, causa]));
  const allowedDocuments = new Set(documents.map(document => document.id));
  return messages.map(message => {
    const causa = message.causaId ? allowedCausas.get(message.causaId) || null : null;
    return publicMailboxMessage({
      ...message,
      causaId: causa?.id || null,
      causa,
      attachments: message.attachments?.map(attachment => ({
        ...attachment,
        documentoId: attachment.documentoId && allowedDocuments.has(attachment.documentoId) ? attachment.documentoId : null,
      })),
    });
  });
}
