import type { ExternalShareDraft, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyAltazorShareOrigin } from "@/lib/altazor/share-origin";
import { canSome } from "@/lib/auth/permissions";
import { ConnectorError } from "../core";

export async function verifyShareOrigin(draft: Pick<ExternalShareDraft, "ownerId" | "originJson">, ownerId: string, db: PrismaClient | Prisma.TransactionClient = prisma) {
  const actor = await db.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor) throw new ConnectorError("owner_unavailable", "El borrador no está disponible.", 404);
  if (!canSome(actor, "assistant.use")) throw new ConnectorError("forbidden", "No tiene acceso al asistente personal.", 403);
  await verifyAltazorShareOrigin(draft, actor, db);
}
export async function visibleShareDrafts(drafts: ExternalShareDraft[], ownerId: string) {
  const visible: ExternalShareDraft[] = []; let withheld = 0;
  for (const draft of drafts) {
    try { await verifyShareOrigin(draft, ownerId); visible.push(draft); }
    catch (error) { if ([403, 404, 409, 410].includes(Number((error as { status?: number }).status))) withheld++; else throw error; }
  }
  return { drafts: visible, withheld };
}
