import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { assertCausaMailAccess } from "@/lib/mail/access";
import { parseMailContent } from "@/lib/mail/parse";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseTablaDate(raw: string): Date | undefined {
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function applyMailboxMessage(
  user: Pick<User, "id" | "role">,
  messageId: string,
  causaId?: string
) {
  const message = await prisma.mailboxMessage.findFirst({
    where: { id: messageId, userId: user.id },
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

  const parsed = parseJson(message.parsedJson, parseMailContent(message.subject, message.bodyText));
  const updates: { proximaTabla?: Date; proximaTablaNota?: string } = {};

  if (parsed.kind === "tablas" && parsed.tablaFecha) {
    const d = parseTablaDate(parsed.tablaFecha);
    if (d) {
      updates.proximaTabla = d;
      updates.proximaTablaNota = parsed.tablaNota || parsed.tablaSala || "Desde correo PJUD";
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.causa.update({
      where: { id: targetCausaId },
      data: updates,
    });
  }

  if (parsed.kind === "resolucion" && parsed.resolucion) {
    await prisma.causaMovimiento.create({
      data: {
        causaId: targetCausaId,
        titulo: parsed.resolucion.slice(0, 200),
        detalle: message.bodyText.slice(0, 4000),
        fuente: "import",
        tipo: "resolucion",
        referencia: message.externalId || message.id,
        externalId: message.externalId || message.id,
      },
    });
  }

  const updated = await prisma.mailboxMessage.update({
    where: { id: message.id },
    data: {
      status: "aplicado",
      causaId: targetCausaId,
    },
  });

  await writeAuditStrict({
    actorId: user.id,
    action: "mail.apply",
    entityType: "MailboxMessage",
    entityId: message.id,
    after: { causaId: targetCausaId, kind: message.kind },
  });

  return updated;
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
