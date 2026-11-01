/**
 * Hitos de plazo fatal/normal + escalamiento sin acuse (§6.5).
 * Conserva Plazo.alertaEnviada como bandera legacy de «ya se consideró».
 */

import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { civilDateKey } from "@/lib/chile-time";
import { addDaysYmd, zonedTime, DEFAULT_TZ } from "@/lib/notify/time";
import { emitNotification } from "@/lib/notify/emit";
import { writeAuditStrict } from "@/lib/audit";
import { notificationTransaction, type NotifyClient } from "@/lib/notify/transaction";
import { canReceiveNotification } from "@/lib/notify/access";

export const HITOS_FATAL = ["T-7", "T-3", "T-1", "T-0"] as const;
export const HITOS_NORMAL = ["T-3", "T-0"] as const;
export type HitoFatal = (typeof HITOS_FATAL)[number];

const HITO_OFFSET: Record<string, number> = {
  "T-7": 7,
  "T-3": 3,
  "T-1": 1,
  "T-0": 0,
};

/**
 * Día civil del hito. Usa `civilDateKey` (fecha-solo UTC) alineado al resto de plazos.
 */
export function hitoDueYmd(fechaLimite: Date, hito: string): string {
  const due = civilDateKey(fechaLimite);
  const offset = HITO_OFFSET[hito];
  if (offset === undefined) return due;
  return addDaysYmd(due, -offset);
}

export function isHitoReady(opts: {
  fechaLimite: Date;
  hito: string;
  now: Date;
  tz?: string;
}): boolean {
  const tz = opts.tz || DEFAULT_TZ;
  const targetYmd = hitoDueYmd(opts.fechaLimite, opts.hito);
  const slot = zonedTime(targetYmd, "09:00", tz);
  return opts.now.getTime() >= slot.getTime();
}

/** Process pages by immutable id so completed/early rows never starve later deadlines. */
export async function processPlazoHitos(opts?: { now?: Date; client?: PrismaClient; plazoIds?: string[]; lookAheadDays?: number }) {
  const client = opts?.client || prisma;
  const now = opts?.now || new Date();
  const until = new Date(now.getTime() + (opts?.lookAheadDays ?? 8) * 86_400_000);
  let cursor: string | undefined;
  let checked = 0, generated = 0, notifications = 0;
  for (;;) {
    const page = await client.plazo.findMany({
      where: { ...(opts?.plazoIds ? { id: { in: opts.plazoIds } } : {}), estado: "pendiente", fechaLimite: { gte: new Date(now.getTime() - 2 * 86_400_000), lte: until },
        ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: 200,
    });
    if (!page.length) break;
    checked += page.length;
    for (const item of page) {
      const outcome = await notificationTransaction(client, async (tx) => {
        const plazo = await tx.plazo.findUnique({ where: { id: item.id }, include: { causa: true } });
        if (!plazo || plazo.estado !== "pendiente") return { generated: 0, notifications: 0 };
        const users: string[] = [];
        for (const userId of new Set([plazo.responsableId, plazo.causa?.abogadoId].filter((id): id is string => Boolean(id)))) {
          if (await canReceiveNotification(userId, { entityType: "plazo", entityId: plazo.id }, tx)) users.push(userId);
        }
        if (!users.length) return { generated: 0, notifications: 0 };
        let generated = 0, notifications = 0;
        for (const hito of plazo.esFatal ? HITOS_FATAL : HITOS_NORMAL) {
          if (!isHitoReady({ fechaLimite: plazo.fechaLimite, hito, now })) continue;
          const claim = await tx.plazoAlerta.createMany({ data: [{ plazoId: plazo.id, hito }], skipDuplicates: true });
          // Existing orphan milestones from interrupted older hosts are repaired by per-user dedupe.
          const dueKey = civilDateKey(plazo.fechaLimite);
          const tipo = plazo.esFatal ? "plazo.fatal" : "plazo.normal";
          const title = `${plazo.esFatal ? "Plazo fatal" : "Plazo próximo"} · ${plazo.causa?.rit || plazo.causa?.titulo || "causa"}`;
          const body = `${plazo.titulo} · hito ${hito} · vence ${dueKey}`;
          const href = plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos";
          for (const userId of users) {
            const result = await emitNotification({ tipo, userId, title, body, href,
              entityType: "plazo", entityId: plazo.id, dedupeKey: `plazo:${plazo.id}:${hito}:${userId}`,
              vars: { title, body, href, rit: plazo.causa?.rit, plazoTitulo: plazo.titulo,
                fechaLimite: dueKey, causaId: plazo.causaId, hito }, now }, tx);
            if (result.notificationId && !result.skipped) notifications += 1;
          }
          generated += claim.count;
        }
        if (generated) await tx.plazo.update({ where: { id: plazo.id }, data: { alertaEnviada: true } });
        return { generated, notifications };
      });
      generated += outcome.generated; notifications += outcome.notifications;
    }
    cursor = page[page.length - 1].id;
  }
  return { plazos: checked, generated, notifications };
}

/** After T-1 noon: notify partners and explicit supervisors who can still read the case. */
export async function processPlazoEscalamiento(opts?: { now?: Date; client?: PrismaClient; plazoIds?: string[] }) {
  const client = opts?.client || prisma;
  const now = opts?.now || new Date();
  let cursor: string | undefined;
  let checked = 0, escalated = 0;
  for (;;) {
    const page = await client.plazoAlerta.findMany({
      where: { hito: { in: ["T-1", "T-0"] }, ackAt: null,
        plazo: { estado: "pendiente", esFatal: true }, ...(opts?.plazoIds ? { plazoId: { in: opts.plazoIds } } : {}), ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: 100,
    });
    if (!page.length) break;
    checked += page.length;
    for (const candidate of page) {
      const didEscalate = await notificationTransaction(client, async (tx) => {
        const alerta = await tx.plazoAlerta.findUnique({ where: { id: candidate.id }, include: { plazo: { include: { causa: true } } } });
        if (!alerta || alerta.ackAt || alerta.plazo.estado !== "pendiente") return false;
        const plazo = alerta.plazo;
        // Noon is relative to the milestone day, not merely today's clock hour.
        const noon = zonedTime(hitoDueYmd(plazo.fechaLimite, "T-1"), "12:00", DEFAULT_TZ);
        if (now < noon) return false;
        const candidates = await tx.user.findMany({
          where: { OR: [{ role: "socio" }, ...(plazo.causaId ? [{ causaMembresias: { some: {
            causaId: plazo.causaId, rol: "supervisor", desde: { lte: now }, OR: [{ hasta: null }, { hasta: { gt: now } }],
          } } }] : [])] },
          select: { id: true },
        });
        const recipients: string[] = [];
        for (const user of candidates) if (await canReceiveNotification(user.id, { entityType: "plazo", entityId: plazo.id }, tx)) recipients.push(user.id);
        if (!recipients.length) return false;
        const created = await tx.plazoAlerta.createMany({ data: [{ plazoId: plazo.id, hito: "escalamiento" }], skipDuplicates: true });
        if (!created.count) return false;
        const dueKey = civilDateKey(plazo.fechaLimite);
        const title = "Escalamiento · plazo fatal sin acuse";
        const body = `${plazo.titulo} (${plazo.causa?.rit || "sin RIT"}) vence ${dueKey} — sin acuse`;
        const href = plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos";
        for (const userId of recipients) await emitNotification({
          tipo: "plazo.fatal.escalamiento", userId, title, body, href,
          entityType: "plazo", entityId: plazo.id, dedupeKey: `plazo:${plazo.id}:escalamiento:${userId}`,
          vars: { title, body, href, rit: plazo.causa?.rit, plazoTitulo: plazo.titulo,
            fechaLimite: dueKey, causaId: plazo.causaId, hito: "escalamiento" }, now,
        }, tx);
        return true;
      });
      if (didEscalate) escalated += 1;
    }
    cursor = page[page.length - 1].id;
  }
  return { checked, escalated };
}

/** Only an actual recipient with current case access may acknowledge their own notices. */
export async function ackPlazo(opts: {
  plazoId: string; userId: string; via: string; notificationId?: string;
}, client: NotifyClient = prisma) {
  return notificationTransaction(client, async (tx) => {
    if (!await canReceiveNotification(opts.userId, { entityType: "plazo", entityId: opts.plazoId }, tx)) {
      return { ok: false as const, error: "no encontrada" };
    }
    const notices = await tx.notification.findMany({ where: {
      userId: opts.userId, entityType: "plazo", entityId: opts.plazoId,
      ...(opts.notificationId ? { id: opts.notificationId } : {}),
    } });
    if (!notices.length) return { ok: false as const, error: "no encontrada" };
    const now = new Date();
    const hitos = new Set<string>();
    const prefix = `plazo:${opts.plazoId}:`, suffix = `:${opts.userId}`;
    for (const notice of notices) {
      if (notice.dedupeKey?.startsWith(prefix) && notice.dedupeKey.endsWith(suffix)) {
        hitos.add(notice.dedupeKey.slice(prefix.length, -suffix.length));
      }
    }
    const updated = hitos.size ? await tx.plazoAlerta.updateMany({
      where: { plazoId: opts.plazoId, hito: { in: [...hitos] }, ackAt: null },
      data: { ackAt: now, ackById: opts.userId, ackVia: opts.via },
    }) : { count: 0 };
    await tx.notification.updateMany({ where: { id: { in: notices.map(n => n.id) }, userId: opts.userId, ackAt: null },
      data: { ackAt: now, ackVia: opts.via, read: true } });
    await writeAuditStrict({ actorId: opts.userId, action: "notify.ack", entityType: "plazo", entityId: opts.plazoId,
      after: { via: opts.via, at: now.toISOString(), alertas: updated.count } }, tx);
    return { ok: true as const, alertas: updated.count };
  });
}

export async function ackNotification(opts: { notificationId: string; userId: string; via: string }, client: NotifyClient = prisma) {
  return notificationTransaction(client, async (tx) => {
    const notice = await tx.notification.findFirst({ where: { id: opts.notificationId, userId: opts.userId } });
    if (!notice || !await canReceiveNotification(opts.userId, notice, tx)) return { ok: false as const, error: "no encontrada" };
    if (notice.entityType === "plazo" && notice.entityId) return ackPlazo({ ...opts, plazoId: notice.entityId }, tx);
    const now = new Date();
    await tx.notification.updateMany({ where: { id: notice.id, userId: opts.userId, ackAt: null },
      data: { ackAt: now, ackVia: opts.via, read: true } });
    await writeAuditStrict({ actorId: opts.userId, action: "notify.ack", entityType: "notification", entityId: notice.id,
      after: { via: opts.via } }, tx);
    return { ok: true as const };
  });
}
