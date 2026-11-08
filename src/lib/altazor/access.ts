import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, causaAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isRole, STAFF_ROLES } from "@/lib/auth/roles";
import type { AltazorClient } from "./types";

export async function altazorActor(user: CausaAccessUser, client: AltazorClient = prisma) {
  const actor = await client.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, sessionVersion: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isRole(actor.role) || !STAFF_ROLES.includes(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para usar ALTAZOR", 403);
  return { ...actor, role: actor.role };
}
export function altazorScopeKey(causaId?: string | null) { return causaId ? `causa:${causaId}` : "personal"; }
export async function conversationFor(id: string, user: CausaAccessUser, client: AltazorClient = prisma, write = false) {
  const actor = await altazorActor(user, client);
  const conversation = await client.altazorConversation.findFirst({ where: { id, ownerId: actor.id } });
  if (!conversation || conversation.scopeKey !== altazorScopeKey(conversation.causaId)) throw httpError("Conversación no encontrada o sin acceso actual", 404);
  if (conversation.causaId) await assertCausaAccess(conversation.causaId, actor, undefined, client);
  if (write && conversation.status !== "active") throw httpError("La conversación está archivada", 409);
  return { actor, conversation };
}
export function conversationAccessWhere(user: CausaAccessUser): Prisma.AltazorConversationWhereInput {
  return { ownerId: user.id, OR: [{ causaId: null, scopeKey: "personal" }, { causa: causaAccessWhere(user) }] };
}
export async function altazorTransaction<T>(client: PrismaClient, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (!["P2034", "P2002"].includes(code || "") || attempt >= 6) { if (code === "P2002") throw httpError("Ya hay una operación en curso. Vuelva a cargar la conversación", 409); throw error; }
      // Retry only rolled-back database transactions. A short jittered backoff
      // lets concurrent commits finish instead of exhausting retries in lockstep.
      await delay(Math.min(250, 10 * 2 ** attempt) + randomInt(0, 21));
    }
  }
}
