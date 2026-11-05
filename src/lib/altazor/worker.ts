import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isRole } from "@/lib/auth/roles";
import { executeAltazorTurn } from "./conversations";
import type { AltazorServiceOptions } from "./types";

export const ALTAZOR_QUEUE_TTL_MS = 24 * 60 * 60_000;
/** A Host/cron may finish an explicitly submitted message after its tab closes.
 * The normal executor owns the CAS lease and rechecks all frozen dependencies.
 * Confirmation, expired leases, legacy sessions and partial writes never replay.
 */
export async function runQueuedAltazorTurns(client: PrismaClient = prisma, options: AltazorServiceOptions & { limit?: number; now?: Date } = {}) {
  const now = options.now || new Date(), oldest = new Date(now.getTime() - ALTAZOR_QUEUE_TTL_MS);
  const eligibleOwner = { OR: [{ altazorCompanion: { is: null } }, { altazorCompanion: { is: { backgroundEnabled: true } } }] };
  const expired = await client.altazorTurn.updateMany({ where: { status: "queued", actorSessionVersion: { not: null }, createdAt: { lt: oldest }, owner: eligibleOwner }, data: { status: "interrupted", errorCode: "queue_expired", finishedAt: now } });
  const rows = await client.altazorTurn.findMany({ where: { status: "queued", actorSessionVersion: { not: null }, cancelRequestedAt: null, createdAt: { gte: oldest, lte: now }, owner: eligibleOwner }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(5, options.limit || 1)), select: { id: true, ownerId: true, conversationId: true, actorSessionVersion: true } });
  const result = { considered: rows.length, completed: 0, awaitingConfirmation: 0, blocked: 0, skipped: 0, expired: expired.count };
  for (const row of rows) {
    try {
      const actor = await client.user.findUnique({ where: { id: row.ownerId }, select: { id: true, role: true, sessionVersion: true } });
      const preference = await client.altazorCompanion.findUnique({ where: { ownerId: row.ownerId }, select: { backgroundEnabled: true } });
      if (preference && !preference.backgroundEnabled) { result.skipped++; continue; }
      if (!actor || !isRole(actor.role) || actor.sessionVersion !== row.actorSessionVersion) throw Error("actor_unavailable");
      await executeAltazorTurn(row.conversationId, row.id, { ...actor, role: actor.role }, client, options);
      const current = await client.altazorTurn.findUnique({ where: { id: row.id }, select: { status: true } });
      if (current?.status === "completed") result.completed++;
      else if (current?.status === "awaiting_confirmation") result.awaitingConfirmation++;
      else if (current?.status === "running") result.skipped++;
      else result.blocked++;
    } catch {
      await client.altazorTurn.updateMany({ where: { id: row.id, status: "queued" }, data: { status: "blocked", errorCode: "context_unavailable", finishedAt: now } });
      result.blocked++;
    }
  }
  return result;
}
