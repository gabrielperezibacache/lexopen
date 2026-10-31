/**
 * Hitos de plazo fatal/normal + escalamiento sin acuse (§6.5).
 * Conserva Plazo.alertaEnviada como bandera legacy de «ya se consideró».
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { civilDateKey } from "@/lib/chile-time";
import { addDaysYmd, wallParts, zonedTime, DEFAULT_TZ } from "@/lib/notify/time";
import { emitNotification } from "@/lib/notify/emit";
import { writeAudit } from "@/lib/audit";

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

function recipientsFor(plazo: {
  responsableId: string | null;
  responsable: { id: string } | null;
  causa: { abogadoId: string | null; abogado: { id: string } | null } | null;
}) {
  const ids = new Set<string>();
  if (plazo.responsable?.id) ids.add(plazo.responsable.id);
  else if (plazo.responsableId) ids.add(plazo.responsableId);
  if (plazo.causa?.abogado?.id) ids.add(plazo.causa.abogado.id);
  else if (plazo.causa?.abogadoId) ids.add(plazo.causa.abogadoId);
  return [...ids];
}

async function ensureHito(
  tx: Prisma.TransactionClient,
  plazoId: string,
  hito: string
) {
  try {
    return await tx.plazoAlerta.create({
      data: { plazoId, hito },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Genera hitos pendientes y emite notificaciones.
 * Reemplaza/evoluciona createPlazoAlerts.
 */
export async function processPlazoHitos(opts?: {
  now?: Date;
  client?: PrismaClient;
  lookAheadDays?: number;
}) {
  const client = opts?.client || prisma;
  const now = opts?.now || new Date();
  const lookAhead = opts?.lookAheadDays ?? 8;
  const until = new Date(now.getTime() + lookAhead * 24 * 60 * 60_000);

  const plazos = await client.plazo.findMany({
    where: {
      estado: "pendiente",
      fechaLimite: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60_000), lte: until },
      OR: [{ responsableId: { not: null } }, { causa: { abogadoId: { not: null } } }],
    },
    include: {
      responsable: { select: { id: true } },
      causa: {
        select: {
          id: true,
          titulo: true,
          rit: true,
          abogadoId: true,
          abogado: { select: { id: true } },
        },
      },
      alertas: { select: { hito: true } },
    },
    orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
    take: 200,
  });

  let generated = 0;
  let notifications = 0;

  for (const plazo of plazos) {
    const hitos = plazo.esFatal ? HITOS_FATAL : HITOS_NORMAL;
    const existing = new Set(plazo.alertas.map((a) => a.hito));
    const users = recipientsFor(plazo);
    if (!users.length) continue;

    for (const hito of hitos) {
      if (existing.has(hito)) continue;
      if (!isHitoReady({ fechaLimite: plazo.fechaLimite, hito, now })) continue;

      const created = await client.$transaction(async (tx) => {
        const row = await ensureHito(tx, plazo.id, hito);
        if (!row) return null;
        if (!plazo.alertaEnviada) {
          await tx.plazo.update({
            where: { id: plazo.id },
            data: { alertaEnviada: true },
          });
        }
        return row;
      });
      if (!created) continue;
      generated += 1;

      const tipo = plazo.esFatal ? "plazo.fatal" : "plazo.normal";
      const dueKey = civilDateKey(plazo.fechaLimite);
      const rit = plazo.causa?.rit || null;
      const title = plazo.esFatal
        ? `Plazo fatal · ${rit || plazo.causa?.titulo || "causa"}`
        : `Plazo próximo · ${rit || plazo.causa?.titulo || "causa"}`;
      const body = `${plazo.titulo} · hito ${hito} · vence ${dueKey}`;
      const href = plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos";

      for (const userId of users) {
        const result = await emitNotification(
          {
            tipo,
            userId,
            title,
            body,
            href,
            entityType: "plazo",
            entityId: plazo.id,
            dedupeKey: `plazo:${plazo.id}:${hito}:${userId}`,
            vars: {
              title,
              body,
              href,
              rit,
              plazoTitulo: plazo.titulo,
              fechaLimite: dueKey,
              causaId: plazo.causaId,
              hito,
            },
            now,
          },
          client
        );
        if (result.notificationId) notifications += 1;
      }
    }
  }

  return { plazos: plazos.length, generated, notifications };
}

/** Escalamiento: T-1 sin acuse después de las 12:00 Chile → supervisor/socio/admin. */
export async function processPlazoEscalamiento(opts?: {
  now?: Date;
  client?: PrismaClient;
}) {
  const client = opts?.client || prisma;
  const now = opts?.now || new Date();
  const parts = wallParts(now, DEFAULT_TZ);
  const noon = zonedTime(parts.ymd, "12:00", DEFAULT_TZ);
  if (now < noon) {
    return { checked: 0, escalated: 0, skipped: "antes_de_12" as const };
  }

  const pending = await client.plazoAlerta.findMany({
    where: {
      hito: { in: ["T-1", "T-0"] },
      ackAt: null,
      plazo: { estado: "pendiente", esFatal: true },
    },
    include: {
      plazo: {
        include: {
          responsable: { select: { id: true } },
          causa: {
            select: {
              id: true,
              rit: true,
              titulo: true,
              abogadoId: true,
              abogado: { select: { id: true } },
            },
          },
        },
      },
    },
    take: 100,
  });

  let escalated = 0;
  for (const alerta of pending) {
    const existingEsc = await client.plazoAlerta.findUnique({
      where: {
        plazoId_hito: { plazoId: alerta.plazoId, hito: "escalamiento" },
      },
    });
    if (existingEsc) continue;

    // Solo escalar si el hito T-1 ya debió generarse (o T-0).
    if (!isHitoReady({ fechaLimite: alerta.plazo.fechaLimite, hito: "T-1", now })) {
      continue;
    }

    const created = await client.$transaction(async (tx) => {
      return ensureHito(tx, alerta.plazoId, "escalamiento");
    });
    if (!created) continue;

    const admins = await client.user.findMany({
      where: { role: "admin" },
      select: { id: true },
      take: 20,
    });
    const recipients = new Set(admins.map((a) => a.id));
    // Socio/supervisor aún no existe como rol (1.1 A); admin + abogado de causa.
    if (alerta.plazo.causa?.abogadoId) recipients.add(alerta.plazo.causa.abogadoId);

    const dueKey = civilDateKey(alerta.plazo.fechaLimite);
    const rit = alerta.plazo.causa?.rit || null;
    const title = `Escalamiento · plazo fatal sin acuse`;
    const body = `${alerta.plazo.titulo} (${rit || "sin RIT"}) vence ${dueKey} — sin acuse`;
    const href = alerta.plazo.causaId
      ? `/causas/${alerta.plazo.causaId}`
      : "/plazos";

    for (const userId of recipients) {
      await emitNotification(
        {
          tipo: "plazo.fatal.escalamiento",
          userId,
          title,
          body,
          href,
          entityType: "plazo",
          entityId: alerta.plazoId,
          dedupeKey: `plazo:${alerta.plazoId}:escalamiento:${userId}`,
          vars: {
            title,
            body,
            href,
            rit,
            plazoTitulo: alerta.plazo.titulo,
            fechaLimite: dueKey,
            hito: "escalamiento",
            causaId: alerta.plazo.causaId,
          },
          now,
        },
        client
      );
    }
    escalated += 1;
  }

  return { checked: pending.length, escalated };
}

export async function ackPlazo(opts: {
  plazoId: string;
  userId: string;
  via: string;
  notificationId?: string;
}) {
  const now = new Date();
  const updated = await prisma.plazoAlerta.updateMany({
    where: { plazoId: opts.plazoId, ackAt: null },
    data: { ackAt: now, ackById: opts.userId, ackVia: opts.via },
  });

  if (opts.notificationId) {
    await prisma.notification.updateMany({
      where: { id: opts.notificationId, userId: opts.userId },
      data: { ackAt: now, ackVia: opts.via, read: true },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        entityType: "plazo",
        entityId: opts.plazoId,
        userId: opts.userId,
        ackAt: null,
      },
      data: { ackAt: now, ackVia: opts.via, read: true },
    });
  }

  await writeAudit({
    actorId: opts.userId,
    action: "notify.ack",
    entityType: "plazo",
    entityId: opts.plazoId,
    after: { via: opts.via, at: now.toISOString(), alertas: updated.count },
  });

  return { ok: true, alertas: updated.count };
}

export async function ackNotification(opts: {
  notificationId: string;
  userId: string;
  via: string;
}) {
  const n = await prisma.notification.findFirst({
    where: { id: opts.notificationId, userId: opts.userId },
  });
  if (!n) return { ok: false as const, error: "no encontrada" };
  const now = new Date();
  await prisma.notification.update({
    where: { id: n.id },
    data: { ackAt: now, ackVia: opts.via, read: true },
  });
  if (n.entityType === "plazo" && n.entityId) {
    await prisma.plazoAlerta.updateMany({
      where: { plazoId: n.entityId, ackAt: null },
      data: { ackAt: now, ackById: opts.userId, ackVia: opts.via },
    });
  }
  await writeAudit({
    actorId: opts.userId,
    action: "notify.ack",
    entityType: "notification",
    entityId: n.id,
    after: { via: opts.via, plazoId: n.entityId },
  });
  return { ok: true as const };
}
