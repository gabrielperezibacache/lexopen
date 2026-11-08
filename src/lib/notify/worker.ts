/** Leased outbox. Ambiguous post-transport failures are reconciled explicitly, never blindly resent. */
import { Prisma, type PrismaClient, type MensajeSaliente } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { decryptCanalDestino } from "@/lib/notify/channels";
import { isExternalChannel, isNivelDetalle } from "@/lib/notify/catalog";
import { getProvider } from "@/lib/notify/providers/registry";
import type { ChannelProvider, DecryptedDestination } from "@/lib/notify/providers/types";
import { renderDigest, renderMessage } from "@/lib/notify/render";
import type { NotifyVars } from "@/lib/notify/minimize";
import { backoffMs } from "@/lib/jobs/queue";
import { canReceiveNotification } from "@/lib/notify/access";

export const OUTBOX_LEASE_MS = 5 * 60_000;
const MAX_INTENTOS = 6;
type ClaimedMessage = MensajeSaliente & { lockedBy: string; lockedAt: Date };
function appUrl() { return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || ""; }

export async function recoverOutboxLeases(now = new Date(), client: PrismaClient = prisma, messageIds?: string[]) {
  const cutoff = new Date(now.getTime() - OUTBOX_LEASE_MS);
  return client.$executeRaw(Prisma.sql`
    UPDATE "MensajeSaliente" SET
      estado = CASE WHEN "envioIniciadoAt" IS NOT NULL THEN 'incierto'
        WHEN intentos >= ${MAX_INTENTOS} THEN 'muerto' ELSE 'encolado' END,
      error = CASE WHEN "envioIniciadoAt" IS NOT NULL THEN 'Envío interrumpido: verificar entrega antes de reenviar'
        ELSE 'Lease vencida antes de iniciar transporte' END,
      "lockedAt" = NULL, "lockedBy" = NULL, "proximoIntentoAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
    WHERE estado = 'enviando' AND ("lockedAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC') OR "lockedAt" IS NULL)
      ${messageIds ? Prisma.sql`AND id IN (${Prisma.join(messageIds.length ? messageIds : ["__none__"])})` : Prisma.empty}
  `);
}

export async function claimMensajes(limit: number, now: Date, client: PrismaClient = prisma, messageIds?: string[]): Promise<ClaimedMessage[]> {
  await recoverOutboxLeases(now, client, messageIds);
  const token = randomUUID();
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<MensajeSaliente[]>(Prisma.sql`
      SELECT * FROM "MensajeSaliente" WHERE estado IN ('encolado', 'fallido')
        AND "proximoIntentoAt" <= (${now}::timestamptz AT TIME ZONE 'UTC') AND intentos < ${MAX_INTENTOS}
        ${messageIds ? Prisma.sql`AND id IN (${Prisma.join(messageIds.length ? messageIds : ["__none__"])})` : Prisma.empty}
      ORDER BY prioridad, "proximoIntentoAt", id FOR UPDATE SKIP LOCKED LIMIT ${limit}
    `);
    if (rows.length) await tx.mensajeSaliente.updateMany({ where: { id: { in: rows.map(r => r.id) } },
      data: { estado: "enviando", lockedAt: now, lockedBy: token, envioIniciadoAt: null, intentos: { increment: 1 } } });
    return rows.map(row => ({ ...row, intentos: row.intentos + 1, lockedBy: token, lockedAt: now }));
  });
}
function leaseWhere(row: ClaimedMessage) {
  return { id: row.id, estado: "enviando", lockedBy: row.lockedBy, lockedAt: row.lockedAt };
}

export async function resolveOutboxDestination(row: Pick<MensajeSaliente, "canal" | "canalUsuarioId" | "userId">, client: PrismaClient = prisma): Promise<DecryptedDestination | null> {
  if (row.canal === "email") {
    const user = await client.user.findUnique({ where: { id: row.userId }, select: { email: true } });
    return user?.email ? { kind: "email", email: user.email } : null;
  }
  if (!row.canalUsuarioId || !await client.canalUsuario.findFirst({
    where: { id: row.canalUsuarioId, userId: row.userId, estado: "activo", canal: row.canal }, select: { id: true },
  })) return null;
  const plain = await decryptCanalDestino(row.canalUsuarioId, client);
  if (!plain) return null;
  if (plain.canal === "whatsapp") return { kind: "whatsapp", e164: plain.e164 };
  return plain.canal === "telegram" ? { kind: "telegram", chatId: plain.chatId } : { kind: "push", subscription: plain.subscription };
}

export async function outboxStillAuthorized(row: Pick<MensajeSaliente, "notificationId" | "userId" | "payloadJson" | "plantilla">, client: Prisma.TransactionClient) {
  if (row.notificationId) {
    const notice = await client.notification.findFirst({ where: { id: row.notificationId, userId: row.userId } });
    return Boolean(notice && await canReceiveNotification(row.userId, notice, client));
  }
  if (row.plantilla === "digest") {
    const payload = JSON.parse(row.payloadJson) as { sourceIds?: string[] };
    const children = await client.mensajeSaliente.findMany({ where: { id: { in: payload.sourceIds || [] }, userId: row.userId } });
    // Never send stale sensitive payload if a single source is no longer readable.
    for (const child of children) if (!await outboxStillAuthorized(child, client)) return false;
    return children.length > 0;
  }
  return Boolean(await client.user.findUnique({ where: { id: row.userId }, select: { id: true } }));
}

export async function processOutboxBatch(opts?: {
  limit?: number; now?: Date; client?: PrismaClient; messageIds?: string[];
  providerFor?: (id: Parameters<typeof getProvider>[0]) => Promise<ChannelProvider | null>;
}) {
  const client = opts?.client || prisma, now = opts?.now || new Date();
  const rows = await claimMensajes(Math.min(Math.max(opts?.limit || 20, 1), 100), now, client, opts?.messageIds);
  let sent = 0, failed = 0, dead = 0, uncertain = 0, suppressed = 0;
  for (const row of rows) {
    let transportStarted = false;
    try {
      if (!await outboxStillAuthorized(row, client)) {
        await client.mensajeSaliente.updateMany({ where: leaseWhere(row),
          data: { estado: "suprimido", error: "Destinatario sin acceso vigente", lockedAt: null, lockedBy: null } });
        suppressed += 1; continue;
      }
      if (!isExternalChannel(row.canal)) { await markFail(row, "canal desconocido", false, client); dead += 1; continue; }
      const providerId = row.canal === "email" ? "email" : row.canal === "push" ? "webpush" : row.canal;
      const provider = await (opts?.providerFor || getProvider)(providerId);
      if (!provider) { await markFail(row, "proveedor no configurado", true, client); failed += 1; continue; }
      const dest = await resolveOutboxDestination(row, client);
      if (!dest) { await markFail(row, "destino no disponible", false, client); dead += 1; continue; }
      const payload = JSON.parse(row.payloadJson || "{}") as NotifyVars & { nombre?: string; items?: Array<{ title: string; body: string; seccion: string }>; sourceIds?: string[] };
      const rendered = row.plantilla === "digest"
        ? renderDigest({ nombre: payload.nombre || "usuario", items: payload.items || [], appUrl: appUrl() })
        : renderMessage({ tipo: row.plantilla, canal: row.canal,
          nivel: isNivelDetalle(row.nivelDetalle) ? row.nivelDetalle : "minimo", vars: payload, payload, appUrl: appUrl() });
      const started = await client.mensajeSaliente.updateMany({ where: leaseWhere(row), data: { envioIniciadoAt: new Date() } });
      if (!started.count) continue;
      transportStarted = true;
      const result = await provider.send(rendered, dest, { dedupeKey: row.dedupeKey, notificationId: row.notificationId || undefined });
      if (!result.ok) {
        if (result.uncertain) throw new Error(result.error);
        transportStarted = false; // Explicit provider rejection is safe to retry.
        await markFail(row, result.error, result.retryable, client, result.retryAfterMs);
        if (result.blockDestination && row.canalUsuarioId) await client.canalUsuario.updateMany({
          where: { id: row.canalUsuarioId, userId: row.userId },
          data: { estado: "bloqueado", ultimoError: result.error.slice(0, 500), ultimoErrorAt: new Date() },
        });
        if (!result.retryable || row.intentos >= MAX_INTENTOS) dead += 1; else failed += 1;
        continue;
      }
      await client.$transaction(async (tx) => {
        const updated = await tx.mensajeSaliente.updateMany({ where: leaseWhere(row),
          data: { estado: "enviado", enviadoAt: new Date(), proveedor: provider.id,
            proveedorMessageId: result.providerMessageId || null, error: null, lockedAt: null, lockedBy: null } });
        if (!updated.count) return;
        await tx.eventoEntrega.create({ data: { mensajeId: row.id, estado: "enviado", detalle: provider.id } });
        if (row.plantilla === "digest") await tx.mensajeSaliente.updateMany({
          where: { id: { in: payload.sourceIds || [] }, userId: row.userId, estado: "agrupado" },
          data: { estado: "enviado", enviadoAt: new Date(), proveedor: provider.id, proveedorMessageId: result.providerMessageId || null },
        });
        if (row.canalUsuarioId) await tx.canalUsuario.updateMany({ where: { id: row.canalUsuarioId, userId: row.userId }, data: { ultimoUsoAt: new Date() } });
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (transportStarted) {
        // Sending and committing are not one atomic operation across a remote provider.
        await client.mensajeSaliente.updateMany({ where: leaseWhere(row), data: {
          estado: "incierto", error: `Verificar entrega: ${message}`.slice(0, 500), lockedAt: null, lockedBy: null,
        } });
        uncertain += 1;
      } else {
        await markFail(row, message, true, client);
        failed += 1;
      }
    }
  }
  return { claimed: rows.length, sent, failed, dead, uncertain, suppressed };
}

async function markFail(row: ClaimedMessage, error: string, retryable: boolean, client: PrismaClient, retryAfterMs?: number) {
  const dead = !retryable || row.intentos >= MAX_INTENTOS;
  return client.$transaction(async (tx) => {
    const result = await tx.mensajeSaliente.updateMany({ where: leaseWhere(row), data: {
      estado: dead ? "muerto" : "fallido", error: error.slice(0, 500), lockedAt: null, lockedBy: null, envioIniciadoAt: null,
      proximoIntentoAt: new Date(Date.now() + (retryAfterMs || backoffMs(row.intentos))),
    } });
    if (result.count) await tx.eventoEntrega.create({ data: { mensajeId: row.id, estado: dead ? "muerto" : "fallido", detalle: error.slice(0, 500) } });
    return result;
  });
}

export async function outboxStats() {
  const counts = await prisma.mensajeSaliente.groupBy({ by: ["estado"], _count: true });
  const result = Object.fromEntries(counts.map(row => [row.estado, row._count]));
  const oldest = await prisma.mensajeSaliente.findFirst({ where: { estado: { in: ["encolado", "fallido", "incierto"] } },
    orderBy: { createdAt: "asc" }, select: { createdAt: true, canal: true } });
  return { encolado: result.encolado || 0, enviando: result.enviando || 0, fallido: result.fallido || 0,
    muerto: result.muerto || 0, incierto: result.incierto || 0, digest: result.digest || 0,
    oldestEnqueuedAt: oldest?.createdAt?.toISOString() || null, oldestCanal: oldest?.canal || null };
}
