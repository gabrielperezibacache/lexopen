import type { PrismaClient } from "@prisma/client";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { altazorActor, altazorScopeKey, conversationAccessWhere } from "./access";
import { visibleAltazorTurn } from "./conversations";
import { altazorId } from "./schemas";
import { ALTAZOR_LIMITS } from "./types";

const scopeIdentitySelect = { id: true, causaId: true, scopeKey: true } as const;
const scopeSelect = { ...scopeIdentitySelect, status: true, causa: { select: { titulo: true } } } as const;

function timelineCursor(raw: string | null | undefined) {
  if (raw === null || raw === undefined) return null;
  const [date, id, extra] = raw.length <= 190 ? raw.split("~") : [];
  const createdAt = new Date(date || "");
  if (extra !== undefined || !altazorId.safeParse(id).success || !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== date) {
    throw httpError("La posición del historial no es válida. Vuelve a cargar la conversación.", 400);
  }
  return { id, createdAt };
}

/** Unified display only. Turn creation, context recall and execution keep their original scopes. */
export async function readAltazorTimeline(user: CausaAccessUser, before?: string | null, client: PrismaClient = prisma) {
  const cursor = timelineCursor(before);
  const actor = await altazorActor(user, client);
  const rows = await client.altazorTurn.findMany({
    where: {
      ownerId: actor.id,
      conversation: conversationAccessWhere(actor),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    include: { conversation: { select: scopeIdentitySelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: ALTAZOR_LIMITS.turnsPerPage + 1,
  });
  const visible = rows.slice(0, ALTAZOR_LIMITS.turnsPerPage).reverse();
  const projected = [], validated = new Set<string>();
  for (const row of visible) {
    const conversation = row.conversation;
    if (conversation.scopeKey !== altazorScopeKey(conversation.causaId)) continue;
    const { sourceRefs, ...turn } = await visibleAltazorTurn(row, actor, conversation, client, {}, validated);
    projected.push({ prior: conversation, turn: { ...turn, sourceRefs: sourceRefs.map(({ title, href }) => ({ title, href })), conversationId: conversation.id } });
  }

  // Source checks can take time. Do not return scope metadata after a concurrent access change.
  const current = new Map((visible.length ? await client.altazorConversation.findMany({
    where: { AND: [conversationAccessWhere(await altazorActor(user, client)), { id: { in: [...new Set(visible.map(row => row.conversationId))] } }] },
    select: scopeSelect,
  }) : []).map(row => [row.id, row]));
  const turns = projected.flatMap(({ prior, turn }) => {
    const conversation = current.get(turn.conversationId);
    if (!conversation || conversation.scopeKey !== prior.scopeKey || conversation.causaId !== prior.causaId) return [];
    return [{
      ...turn,
      // Saved chat titles can repeat the text of a now-restricted turn.
      conversationTitle: conversation.causa?.titulo || "Tu conversación",
      conversationStatus: conversation.status,
      scopeKey: conversation.scopeKey,
      causaId: conversation.causaId,
    }];
  });
  const oldest = turns[0];
  const hasMore = Boolean(oldest && rows.length > ALTAZOR_LIMITS.turnsPerPage);
  return { turns, hasMore, before: hasMore ? `${oldest.createdAt}~${oldest.id}` : null };
}
