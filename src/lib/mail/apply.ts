import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertCausaMailAccess } from "@/lib/mail/access";
import { fileMailboxMessageToCausa } from "@/lib/mail/file-to-folders";

export async function applyMailboxMessage(
  user: Pick<User, "id" | "role">,
  messageId: string,
  causaId?: string
) {
  const message = await prisma.mailboxMessage.findFirst({
    where: { id: messageId, userId: user.id },
    select: { id: true, causaId: true },
  });
  if (!message) {
    const err = new Error("Mensaje no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const targetCausaId = causaId || message.causaId;
  if (!targetCausaId) {
    const err = new Error("Seleccione una causa") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  await assertCausaMailAccess(user, targetCausaId);
  return fileMailboxMessageToCausa(user, message.id, targetCausaId);
}

export async function linkMailboxMessage(
  user: Pick<User, "id" | "role">,
  messageId: string,
  causaId: string
) {
  await assertCausaMailAccess(user, causaId);
  const message = await prisma.mailboxMessage.findFirst({
    where: { id: messageId, userId: user.id },
  });
  if (!message) {
    const err = new Error("Mensaje no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return prisma.mailboxMessage.update({
    where: { id: message.id },
    data: { causaId, status: "vinculado" },
  });
}

export async function discardMailboxMessage(userId: string, messageId: string) {
  const message = await prisma.mailboxMessage.findFirst({
    where: { id: messageId, userId },
  });
  if (!message) {
    const err = new Error("Mensaje no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return prisma.mailboxMessage.update({
    where: { id: message.id },
    data: { status: "descartado" },
  });
}
