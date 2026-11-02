import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { minutaConfidentialWhere } from "@/lib/api";
import { causaAccessWhere, documentReadWhere, plazoAccessWhere, requiredCausaWhere, siteFileReadWhere, siteRelatedWhere, type CausaAccessUser } from "@/lib/auth/causa-access";

export type ChatAccessRef = { type: string; id: string };

/** Old answers must not become an indirect reader of revoked source material. */
export async function canReadChatSources(messagesJson: string, user: CausaAccessUser, client: Prisma.TransactionClient = prisma) {
  let messages: Array<{ role?: string; content?: string; source?: string; sources?: ChatAccessRef[]; accessRefs?: ChatAccessRef[] }>;
  try { messages = JSON.parse(messagesJson); if (!Array.isArray(messages)) return false; } catch { return false; }
  const refs = new Map<string, Set<string>>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.content?.trim() || message.source === "error") continue;
    if (!Array.isArray(message.accessRefs) && !Array.isArray(message.sources)) return false;
    for (const ref of [...(message.accessRefs || []), ...(message.sources || [])]) {
      if (!ref || typeof ref.type !== "string" || typeof ref.id !== "string" || ref.id.length > 200) return false;
      if (["jurisprudencia"].includes(ref.type)) continue;
      if (!["causa", "documento", "minuta", "vdr", "wiki", "plazo", "movimiento"].includes(ref.type)) return false;
      const ids = refs.get(ref.type) || new Set<string>(); ids.add(ref.id); refs.set(ref.type, ids);
    }
  }
  for (const [type, ids] of refs) {
    const id = { in: [...ids] };
    let count: number;
    switch (type) {
      case "causa": count = await client.causa.count({ where: { AND: [{ id }, causaAccessWhere(user)] } }); break;
      case "documento": count = await client.documento.count({ where: { AND: [{ id }, documentReadWhere(user)] } }); break;
      case "minuta": count = await client.minuta.count({ where: { AND: [{ id }, minutaConfidentialWhere(user), requiredCausaWhere(user)] } }); break;
      case "vdr": count = await client.siteFile.count({ where: { AND: [{ id }, siteFileReadWhere(user)] } }); break;
      case "wiki": count = await client.wikiPage.count({ where: { AND: [{ id }, siteRelatedWhere(user)] } }); break;
      case "plazo": count = await client.plazo.count({ where: { AND: [{ id }, plazoAccessWhere(user)] } }); break;
      case "movimiento": count = await client.causaMovimiento.count({ where: { AND: [{ id }, requiredCausaWhere(user)] } }); break;
      default: return false;
    }
    if (count !== ids.size) return false;
  }
  return true;
}

export async function assertChatSourcesAccess(messagesJson: string, user: CausaAccessUser, client: Prisma.TransactionClient = prisma) {
  if (!await canReadChatSources(messagesJson, user, client)) {
    throw httpError("Este historial no puede verificarse con sus permisos actuales. Inicie un hilo nuevo con las fuentes disponibles", 409);
  }
}
