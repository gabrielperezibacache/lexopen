import { Prisma, type PrismaClient } from "@prisma/client";
import { plazoAccessWhere, relatedCausaWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { addCivilDays, civilDateKey, civilSpanQueryRange, santiagoDateKey } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { isPjudMailboxAddress } from "@/lib/mail/pjud-sender";
import { altazorActor } from "./access";

const limit = 24;
const candidateLimit = limit * 4;
const lookbackMs = 30 * 24 * 60 * 60 * 1000;
const deadlineTypes = ["plazo.normal", "plazo.fatal", "plazo.fatal.escalamiento"];

export type AltazorUpdate = {
  id: string;
  kind: "court-mail" | "deadline" | "daily-brief";
  title: string;
  message: string;
  occurredAt: string;
  href: string;
  dueAt?: string;
  mailHref?: string;
};

/** Project private, already recorded events. This reader does not sync or send anything. */
export async function readAltazorUpdates(user: CausaAccessUser, client: PrismaClient = prisma): Promise<{ updates: AltazorUpdate[] }> {
  const now = new Date();
  const since = new Date(now.getTime() - lookbackMs);
  const today = santiagoDateKey(now);
  const range = civilSpanQueryRange(today, addCivilDays(today, 7));
  return client.$transaction(async (tx) => {
    const actor = await altazorActor(user, tx);
    const [mail, notices, urgentDeadlines, brief] = await Promise.all([
      tx.mailboxMessage.findMany({
        where: {
          userId: actor.id,
          account: { userId: actor.id },
          externalId: { not: null },
          NOT: { externalId: { startsWith: "paste:" } },
          status: { not: "descartado" },
          fromAddress: { contains: "pjud.cl", mode: "insensitive" },
          createdAt: { gte: since },
          ...relatedCausaWhere(actor),
        },
        select: { id: true, fromAddress: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: candidateLimit,
      }),
      tx.notification.findMany({
        where: { userId: actor.id, tipo: { in: deadlineTypes }, entityType: "plazo", entityId: { not: null }, createdAt: { gte: since } },
        select: { id: true, tipo: true, entityId: true, createdAt: true, ackAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: candidateLimit,
      }),
      tx.plazo.findMany({
        where: { AND: [{ estado: "pendiente", esFatal: true, responsableId: actor.id, fechaLimite: { gte: range.start, lte: range.end } }, plazoAccessWhere(actor)] },
        select: { id: true, createdAt: true, fechaLimite: true },
        orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
        take: limit,
      }),
      tx.altazorDailyBrief.findUnique({
        where: { ownerId_day: { ownerId: actor.id, day: today } },
        select: { createdAt: true },
      }),
    ]);
    const noticeIds = [...new Set(notices.flatMap((notice) => notice.entityId ? [notice.entityId] : []))];
    const deadlines = noticeIds.length ? await tx.plazo.findMany({
      where: { AND: [{ id: { in: noticeIds }, estado: "pendiente" }, plazoAccessWhere(actor)] },
      select: { id: true, fechaLimite: true, esFatal: true },
    }) : [];
    const dueById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));

    const updates: AltazorUpdate[] = mail.filter((message) => isPjudMailboxAddress(message.fromAddress)).map((message) => ({
      id: `court-mail:${message.id}`,
      kind: "court-mail",
      title: "Correo con remitente PJUD",
      message: "Encontré un nuevo mensaje en tu buzón con un remitente del dominio del Poder Judicial. Puedes revisarlo en Correo.",
      occurredAt: message.createdAt.toISOString(),
      href: `/correo?id=${encodeURIComponent(message.id)}`,
    }));
    const urgentIds = new Set(urgentDeadlines.map(deadline => deadline.id));
    const alreadyAnnounced = new Set<string>();
    const priorityUpdates = new Set<string>();
    for (const notice of notices) {
      const deadline = notice.entityId ? dueById.get(notice.entityId) : null;
      if (!deadline) continue;
      const dueAt = civilDateKey(deadline.fechaLimite);
      if (urgentIds.has(deadline.id) && !alreadyAnnounced.has(deadline.id)) priorityUpdates.add(`deadline:${notice.id}`);
      alreadyAnnounced.add(deadline.id);
      updates.push({
        id: `deadline:${notice.id}`,
        kind: "deadline",
        title: deadline.esFatal ? "Aviso de plazo fatal" : "Aviso de vencimiento",
        message: notice.tipo === "plazo.fatal.escalamiento" && !notice.ackAt ? "Hay un aviso de plazo fatal sin confirmación. Revisa el vencimiento en Plazos." : "Hay un aviso para un plazo pendiente. Revisa el vencimiento en Plazos.",
        occurredAt: notice.createdAt.toISOString(),
        href: `/plazos?mes=${dueAt.slice(0, 7)}`,
        dueAt,
      });
    }
    for (const deadline of urgentDeadlines) {
      if (alreadyAnnounced.has(deadline.id)) continue;
      const dueAt = civilDateKey(deadline.fechaLimite);
      const id = `upcoming-deadline:${deadline.id}`;
      priorityUpdates.add(id);
      updates.push({
        id,
        kind: "deadline",
        title: "Aviso de plazo fatal",
        message: "Tienes un plazo fatal en los próximos días. Revisa el vencimiento en Plazos.",
        occurredAt: new Date(Math.max(deadline.createdAt.getTime(), Date.parse(addCivilDays(dueAt, -7)))).toISOString(),
        href: `/plazos?mes=${dueAt.slice(0, 7)}`,
        dueAt,
      });
    }
    const recentMail = brief ? updates.filter(update => update.kind === "court-mail" && Date.parse(update.occurredAt) >= now.getTime() - 86_400_000).length : 0;
    const dailyBrief: AltazorUpdate | null = brief ? {
      id: `daily-brief:${today}`,
      kind: "daily-brief",
      title: "Resumen de hoy",
      message: summaryText(
        new Set([...urgentIds, ...alreadyAnnounced]).size,
        recentMail,
        mail.length === candidateLimit || notices.length === candidateLimit || urgentDeadlines.length === limit,
      ),
      occurredAt: brief.createdAt.toISOString(),
      href: `/plazos?mes=${today.slice(0, 7)}`,
      ...(recentMail ? { mailHref: "/correo" } : {}),
    } : null;
    const chronological = (a: AltazorUpdate, b: AltazorUpdate) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id);
    updates.sort((a, b) => Number(priorityUpdates.has(b.id)) - Number(priorityUpdates.has(a.id)) || chronological(a, b));
    const latest = updates.slice(0, limit);
    if (dailyBrief) latest.push(dailyBrief);
    return { updates: latest.sort(chronological) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function summaryText(deadlines: number, mail: number, limited: boolean) {
  if (!deadlines && !mail) return "Entre tus avisos recientes no encontré plazos pendientes ni correo judicial nuevo para revisar.";
  const counts = [];
  if (deadlines) counts.push(deadlines === 1 ? "1 plazo pendiente para revisar" : `${deadlines} plazos pendientes para revisar`);
  if (mail) counts.push(mail === 1 ? "1 correo judicial registrado en las últimas 24 horas" : `${mail} correos judiciales registrados en las últimas 24 horas`);
  return `Entre tus avisos recientes encontré ${limited ? "al menos " : ""}${counts.join(" y ")}.`;
}
