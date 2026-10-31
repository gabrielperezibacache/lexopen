/**
 * emitNotification — punto único para in-app + outbox (§6.5.4).
 * Transaccional: Notification + MensajeSaliente en la misma TX.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  prioridadPara,
  tipoDef,
  type ExternalChannel,
} from "@/lib/notify/catalog";
import {
  loadDestinos,
  loadPerfil,
  loadPrefs,
} from "@/lib/notify/channels";
import { minimizeVars, type NotifyVars } from "@/lib/notify/minimize";
import {
  resolveDeliveries,
  type PerfilNotif,
  type PrefRow,
  type Destino,
} from "@/lib/notify/preferences";

export type EmitInput = {
  tipo: string;
  userId: string;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Idempotencia in-app; si falta se genera. */
  dedupeKey?: string | null;
  vars?: NotifyVars;
  now?: Date;
};

export type EmitResult = {
  notificationId: string | null;
  mensajes: number;
  skipped?: string;
};

type Tx = Prisma.TransactionClient;

async function withRetrySerializable<T>(
  client: PrismaClient,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 2
      ) {
        throw error;
      }
    }
  }
}

export async function emitNotification(
  input: EmitInput,
  client: PrismaClient = prisma
): Promise<EmitResult> {
  const now = input.now || new Date();
  const def = tipoDef(input.tipo);
  const vars: NotifyVars = {
    title: input.title,
    body: input.body,
    href: input.href,
    ...(input.vars || {}),
  };
  const dedupeKey =
    input.dedupeKey ||
    (input.entityType && input.entityId
      ? `${input.tipo}:${input.entityType}:${input.entityId}:${input.userId}`
      : null);

  const [prefs, perfil, { destinos }] = await Promise.all([
    loadPrefs(input.userId),
    loadPerfil(input.userId),
    loadDestinos(input.userId),
  ]);

  return withRetrySerializable(client, async (tx) => {
    if (dedupeKey) {
      const existing = await tx.notification.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        return { notificationId: existing.id, mensajes: 0, skipped: "dedupe" };
      }
    }

    let notificationId: string | null = null;
    try {
      const n = await tx.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          body: input.body,
          href: input.href || null,
          tipo: input.tipo,
          severidad: def.severidad,
          entityType: input.entityType || null,
          entityId: input.entityId || null,
          dedupeKey,
        },
      });
      notificationId = n.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        dedupeKey
      ) {
        const existing = await tx.notification.findUnique({
          where: { dedupeKey },
          select: { id: true },
        });
        return {
          notificationId: existing?.id || null,
          mensajes: 0,
          skipped: "dedupe",
        };
      }
      throw error;
    }

    const deliveries = resolveDeliveries({
      tipo: input.tipo,
      prefs,
      destinos,
      perfil,
      now,
    });

    let mensajes = 0;
    for (const d of deliveries) {
      const payload = minimizeVars(vars, d.destino.nivel);
      const msgDedupe = `${dedupeKey || notificationId}:${d.destino.canal}`;
      const estado =
        d.modo === "digest_diario" || d.modo === "digest_semanal"
          ? "digest"
          : "encolado";
      try {
        await tx.mensajeSaliente.create({
          data: {
            notificationId,
            userId: input.userId,
            canal: d.destino.canal,
            canalUsuarioId: d.destino.canalUsuarioId,
            plantilla: input.tipo,
            payloadJson: JSON.stringify(payload),
            nivelDetalle: d.destino.nivel,
            dedupeKey: msgDedupe,
            prioridad: prioridadPara(def.severidad),
            estado,
            proximoIntentoAt: d.sendAt,
          },
        });
        mensajes += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }

    return { notificationId, mensajes };
  });
}

/** Emite a varios usuarios (p. ej. responsable + abogado). */
export async function emitNotificationMany(
  inputs: EmitInput[],
  client: PrismaClient = prisma
) {
  const results: EmitResult[] = [];
  for (const input of inputs) {
    results.push(await emitNotification(input, client));
  }
  return results;
}

/** Compatibilidad: crear in-app simple migrando create → emit. */
export async function notifyInApp(opts: {
  userId: string;
  title: string;
  body: string;
  href?: string | null;
  tipo?: string;
}) {
  return emitNotification({
    tipo: opts.tipo || "general",
    userId: opts.userId,
    title: opts.title,
    body: opts.body,
    href: opts.href,
  });
}

export type { Destino, PerfilNotif, PrefRow, ExternalChannel };
