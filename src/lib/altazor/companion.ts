import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { altazorActor, altazorTransaction, conversationFor } from "./access";

export const companionPatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  activeConversationId: z.string().min(1).max(100).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  backgroundEnabled: z.boolean().optional(),
}).strict().refine(value => value.activeConversationId !== undefined || value.memoryEnabled !== undefined || value.backgroundEnabled !== undefined, "Elija una preferencia");

/** Selection is a private pointer, never a substitute for current case/source access. */
export async function readAltazorCompanion(user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await altazorActor(user, client), row = await client.altazorCompanion.findUnique({ where: { ownerId: actor.id } });
  let activeConversationId = row?.activeConversationId || null, selectionUnavailable = false;
  if (activeConversationId) {
    try { const { conversation } = await conversationFor(activeConversationId, actor, client); if (conversation.status !== "active") throw httpError("Conversación archivada", 404); }
    catch { activeConversationId = null; selectionUnavailable = true; }
  }
  return { activeConversationId, selectionUnavailable, memoryEnabled: row?.memoryEnabled ?? true, backgroundEnabled: row?.backgroundEnabled ?? true, revision: row?.revision ?? 0 };
}

export async function patchAltazorCompanion(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = companionPatchSchema.parse(raw);
  await altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    if (input.activeConversationId) await conversationFor(input.activeConversationId, actor, tx, true);
    const row = await tx.altazorCompanion.findUnique({ where: { ownerId: actor.id } });
    const { expectedRevision, ...changes } = input;
    if (!row) {
      if (expectedRevision !== 0) throw httpError("Las preferencias cambiaron. Vuelva a cargarlas", 409);
      await tx.altazorCompanion.create({ data: { ownerId: actor.id, ...changes } });
    } else {
      const changed = await tx.altazorCompanion.updateMany({ where: { ownerId: actor.id, revision: expectedRevision }, data: { ...changes, revision: { increment: 1 } } });
      if (!changed.count) throw httpError("Las preferencias cambiaron. Vuelva a cargarlas", 409);
    }
  });
  return readAltazorCompanion(user, client);
}
