/**
 * Worker de outbox MensajeSaliente — claim SKIP LOCKED + backoff (§6.5.4 / §7.2).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptCanalDestino, markCanalBlocked } from "@/lib/notify/channels";
import { isExternalChannel, isNivelDetalle } from "@/lib/notify/catalog";
import { getProvider } from "@/lib/notify/providers/registry";
import type { DecryptedDestination } from "@/lib/notify/providers/types";
import { renderMessage } from "@/lib/notify/render";
import type { NotifyVars } from "@/lib/notify/minimize";
import { backoffMs } from "@/lib/jobs/queue";

const MAX_INTENTOS = 6;

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
}

async function claimMensajes(limit: number, now: Date) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        notificationId: string | null;
        userId: string;
        canal: string;
        canalUsuarioId: string | null;
        plantilla: string;
        payloadJson: string;
        nivelDetalle: string;
        intentos: number;
      }>
    >(Prisma.sql`
      SELECT id, "notificationId", "userId", canal, "canalUsuarioId", plantilla,
             "payloadJson", "nivelDetalle", intentos
      FROM "MensajeSaliente"
      WHERE estado IN ('encolado', 'fallido')
        AND "proximoIntentoAt" <= ${now}
      ORDER BY prioridad ASC, "proximoIntentoAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);
    if (!rows.length) return rows;
    await tx.mensajeSaliente.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { estado: "enviando", lockedAt: now, intentos: { increment: 1 } },
    });
    return rows;
  });
}

async function resolveDest(
  row: {
    canal: string;
    canalUsuarioId: string | null;
    userId: string;
  }
): Promise<DecryptedDestination | null> {
  if (row.canal === "email") {
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { email: true },
    });
    return user?.email ? { kind: "email", email: user.email } : null;
  }
  if (!row.canalUsuarioId) return null;
  const plain = await decryptCanalDestino(row.canalUsuarioId);
  if (!plain) return null;
  if (plain.canal === "telegram") return { kind: "telegram", chatId: plain.chatId };
  return { kind: "push", subscription: plain.subscription };
}

export async function processOutboxBatch(opts?: { limit?: number; now?: Date }) {
  const now = opts?.now || new Date();
  const limit = Math.min(Math.max(opts?.limit || 20, 1), 100);
  const rows = await claimMensajes(limit, now);
  let sent = 0;
  let failed = 0;
  let dead = 0;

  for (const row of rows) {
    const intentos = row.intentos + 1;
    try {
      if (!isExternalChannel(row.canal)) {
        await markFail(row.id, intentos, "canal desconocido", false);
        failed += 1;
        continue;
      }
      const providerId =
        row.canal === "email" ? "email" : row.canal === "push" ? "webpush" : row.canal;
      const provider = await getProvider(providerId);
      if (!provider) {
        await markFail(row.id, intentos, `proveedor ${providerId} no configurado`, true);
        failed += 1;
        continue;
      }
      const dest = await resolveDest(row);
      if (!dest) {
        await markFail(row.id, intentos, "destino no disponible", false);
        failed += 1;
        continue;
      }
      const payload = JSON.parse(row.payloadJson || "{}") as NotifyVars & Record<string, unknown>;
      const nivel = isNivelDetalle(row.nivelDetalle) ? row.nivelDetalle : "minimo";
      const rendered = renderMessage({
        tipo: row.plantilla,
        canal: row.canal,
        nivel,
        vars: payload,
        payload,
        appUrl: appUrl(),
      });
      const result = await provider.send(rendered, dest, {
        notificationId: row.notificationId || undefined,
      });
      if (result.ok) {
        await prisma.mensajeSaliente.update({
          where: { id: row.id },
          data: {
            estado: "enviado",
            enviadoAt: new Date(),
            proveedor: provider.id,
            proveedorMessageId: result.providerMessageId || null,
            error: null,
            lockedAt: null,
          },
        });
        await prisma.eventoEntrega.create({
          data: { mensajeId: row.id, estado: "enviado", detalle: provider.id },
        });
        if (row.canalUsuarioId) {
          await prisma.canalUsuario.update({
            where: { id: row.canalUsuarioId },
            data: { ultimoUsoAt: new Date() },
          });
        }
        sent += 1;
      } else {
        if (result.blockDestination && row.canalUsuarioId) {
          await markCanalBlocked(row.canalUsuarioId, result.error);
        }
        const outcome = await markFail(
          row.id,
          intentos,
          result.error,
          result.retryable,
          result.retryAfterMs
        );
        if (outcome === "muerto") dead += 1;
        else failed += 1;
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const outcome = await markFail(row.id, intentos, err, true);
      if (outcome === "muerto") dead += 1;
      else failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed, dead };
}

async function markFail(
  id: string,
  intentos: number,
  error: string,
  retryable: boolean,
  retryAfterMs?: number
) {
  const muerto = !retryable || intentos >= MAX_INTENTOS;
  await prisma.mensajeSaliente.update({
    where: { id },
    data: muerto
      ? {
          estado: "muerto",
          error: error.slice(0, 500),
          lockedAt: null,
        }
      : {
          estado: "fallido",
          error: error.slice(0, 500),
          proximoIntentoAt: new Date(
            Date.now() + (retryAfterMs || backoffMs(intentos))
          ),
          lockedAt: null,
        },
  });
  await prisma.eventoEntrega.create({
    data: {
      mensajeId: id,
      estado: muerto ? "muerto" : "fallido",
      detalle: error.slice(0, 500),
    },
  });
  return muerto ? "muerto" : "fallido";
}

export async function outboxStats() {
  const [encolado, enviando, fallido, muerto, oldest] = await Promise.all([
    prisma.mensajeSaliente.count({ where: { estado: "encolado" } }),
    prisma.mensajeSaliente.count({ where: { estado: "enviando" } }),
    prisma.mensajeSaliente.count({ where: { estado: "fallido" } }),
    prisma.mensajeSaliente.count({ where: { estado: "muerto" } }),
    prisma.mensajeSaliente.findFirst({
      where: { estado: { in: ["encolado", "fallido"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, canal: true },
    }),
  ]);
  return {
    encolado,
    enviando,
    fallido,
    muerto,
    oldestEnqueuedAt: oldest?.createdAt?.toISOString() || null,
    oldestCanal: oldest?.canal || null,
  };
}
