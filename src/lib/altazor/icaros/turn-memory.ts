import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { conversationFor } from "../access";
import type { AltazorClient } from "../types";
import { icaroTurnSelectionsSchema } from "./schemas";
import { readSelectedIcaroMemory } from "./service";
import type { IcaroTurnSelection } from "./types";

/** A turn stores references only. The coordinator never receives the memory bodies. */
export async function verifyTurnIcaroSelections(user: CausaAccessUser, causaId: string | null, selections: IcaroTurnSelection[], db: AltazorClient) {
  for (const selection of icaroTurnSelectionsSchema.parse(selections)) {
    const profile = await db.altazorIcaro.findFirst({
      where: { id: selection.icaroId, ownerId: user.id, causaId, enabled: true, memoryEnabled: true,
        scopeKey: causaId ? `causa:${causaId}` : "personal" }, select: { id: true },
    });
    if (!profile) throw httpError("Revisa los recuerdos elegidos para este ámbito.", 409);
    await readSelectedIcaroMemory(profile.id, user, selection.entries, db);
  }
}

export async function turnIcaroMemorySelections(turnId: string, conversationId: string, user: CausaAccessUser, db: AltazorClient = prisma): Promise<IcaroTurnSelection[]> {
  const { actor, conversation } = await conversationFor(conversationId, user, db, true);
  const turn = await db.altazorTurn.findFirst({ where: { id: turnId, conversationId, ownerId: actor.id }, select: { contextJson: true } });
  if (!turn) throw httpError("El turno del encargo ya no está disponible.", 409);
  const selections = icaroTurnSelectionsSchema.parse(JSON.parse(turn.contextJson).icaroMemorySelections ?? []);
  await verifyTurnIcaroSelections(actor, conversation.causaId, selections, db);
  return selections;
}
