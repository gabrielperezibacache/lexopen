import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { causaAccessWhere, assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { validarRit, validarRuc } from "@/lib/chile";
import { normalizeResearchText } from "@/lib/research/search";
import { altazorActor, conversationFor } from "./access";
import { createAltazorConversation } from "./conversations";
import { altazorId, altazorRequestId } from "./schemas";

export const prepareConversationSchema = z.object({
  requestId: altazorRequestId,
  text: z.string().trim().max(8000).default(""),
  title: z.string().trim().min(1).max(160).optional(),
  conversationId: altazorId.nullable().optional(),
  causaId: altazorId.nullable().optional(),
  routeCausaId: altazorId.nullable().optional(),
  documentoId: altazorId.nullable().optional(),
  hasPendingAttachments: z.boolean().default(false),
}).strict();

/** Scope is inferred only from identifiers the user supplied or an authorized page. */
export async function prepareAltazorConversation(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = prepareConversationSchema.parse(raw), actor = await altazorActor(user, client);
  const current = input.conversationId ? (await conversationFor(input.conversationId, actor, client, true)).conversation : null;
  for (const id of [input.causaId, input.routeCausaId]) if (id) await assertCausaAccess(id, actor, { auditOverride: false }, client);
  let documentCase: string | undefined;
  if (input.documentoId) {
    const document = await client.documento.findFirst({ where: { AND: [documentReadWhere(actor), { id: input.documentoId }] }, select: { causaId: true } });
    if (!document) throw httpError("El documento ya no está disponible.", 404);
    if (!document.causaId) return { clarify: "Adjunta este archivo al mensaje para que pueda leerlo contigo." };
    documentCase = document.causaId;
  }
  const explicitIds = [...new Set([input.causaId, documentCase, ...Array.from(input.text.matchAll(/\/(?:causas|pjud)\/([A-Za-z0-9_-]{1,160})(?=[/?#\s]|$)/g), match => match[1])].filter((id): id is string => Boolean(id)))];
  for (const id of explicitIds) await assertCausaAccess(id, actor, { auditOverride: false }, client);
  if (explicitIds.length > 1) return { clarify: "Mencionas documentos o enlaces de causas distintas. Dime con cuál quieres trabajar en este mensaje." };
  // Exact references work in every jurisdiction. A whole international identifier
  // wins before any Chilean-pattern interpretation of a numeric suffix.
  const references = [...new Set((input.text.match(/(?<![A-Za-z0-9._/-])[A-Za-z0-9][A-Za-z0-9._/-]{2,79}(?![A-Za-z0-9._/-])/g) || []).map(value => value.replace(/\.+$/, "")).filter(value => /\d/.test(value) && (/[/-]/.test(value) || value.length >= 6)))].slice(0, 24);
  let mentioned: string | undefined;
  if (references.length) {
    const exact = await client.causa.findMany({ where: { AND: [causaAccessWhere(actor), { OR: references.flatMap(reference => [{ rit: { equals: reference, mode: "insensitive" as const } }, { ruc: { equals: reference, mode: "insensitive" as const } }]) }] }, select: { id: true, rit: true, ruc: true, tribunal: true }, take: 21 });
    if (exact.length) {
      const actualReferences = new Set(exact.flatMap(cause => [cause.rit, cause.ruc].filter((value): value is string => Boolean(value) && references.some(reference => reference.toLocaleLowerCase() === value?.toLocaleLowerCase())).map(value => value.toLocaleLowerCase())));
      if (actualReferences.size > 1 && new Set(exact.map(cause => cause.id)).size > 1) return { clarify: "Mencionas más de un expediente. Dime cuál quieres preparar primero." };
      const namedCourt = exact.filter(cause => cause.tribunal.trim().length > 5 && normalizeResearchText(input.text).includes(normalizeResearchText(cause.tribunal.trim())));
      const hint = explicitIds[0] || input.routeCausaId;
      const selected = exact.length === 1 ? exact[0] : namedCourt.length === 1 ? namedCourt[0] : hint ? exact.find(cause => cause.id === hint) : undefined;
      if (!selected) return { clarify: "Esa referencia corresponde a más de un expediente. Añade el tribunal o abre su ficha para continuar." };
      mentioned = selected.id;
    }
  }
  // Consume a whole dotted ROL before normalization: never mistake 12.345-2026 for 345-2026.
  const ritTokens = input.text.match(/(?<![\p{L}\p{N}.-])[A-Za-z]{0,3}-?(?:\d{1,3}(?:\.\d{3})+|\d{1,6})-\d{4}(?![\p{L}\p{N}-]|\.\d)/gu) || [];
  const rits = [...new Set(ritTokens.flatMap(value => { const normalized = value.replace(/\./g, "").toUpperCase(); return validarRit(normalized) ? [...new Set([normalized, value.toUpperCase()])] : []; }))];
  const rucs = [...new Set((input.text.match(/\b\d{10,12}-?[\dkK]\b/g) || []).filter(validarRuc).map(value => value.toUpperCase()))];
  if (!mentioned && (rits.length || rucs.length)) {
    const candidates = await client.causa.findMany({ where: { AND: [causaAccessWhere(actor), { OR: [...rits.map(rit => ({ rit: { equals: rit, mode: "insensitive" as const } })), ...rucs.map(ruc => ({ ruc: { equals: ruc, mode: "insensitive" as const } }))] }] }, select: { id: true, rit: true, ruc: true, tribunal: true }, take: 21 });
    if (!candidates.length) return { clarify: "No encuentro una causa accesible con ese RIT o ROL. Indícame el tribunal o abre su expediente para continuar." };
    if (new Set(rits.map(value => value.replace(/\./g, ""))).size + rucs.length > 1 && new Set(candidates.map(cause => cause.id)).size > 1) return { clarify: "Mencionas más de una causa. Dime cuál quieres preparar primero." };
    const hinted = explicitIds[0] || input.routeCausaId;
    const namedCourt = candidates.filter(cause => cause.tribunal.trim().length > 5 && normalizeResearchText(input.text).includes(normalizeResearchText(cause.tribunal.trim())));
    const selected = candidates.length === 1 ? candidates[0] : namedCourt.length === 1 ? namedCourt[0] : hinted ? candidates.find(cause => cause.id === hinted) : undefined;
    if (!selected) return { clarify: "Ese RIT o ROL corresponde a más de una causa. Añade el tribunal para que trabaje en el expediente correcto." };
    mentioned = selected.id;
  }
  if (mentioned && explicitIds[0] && mentioned !== explicitIds[0]) return { clarify: "El RIT y el documento o enlace corresponden a causas distintas. Dime cuál quieres utilizar." };
  const causaId = mentioned || explicitIds[0] || input.routeCausaId || current?.causaId || null;
  if (current && current.causaId === causaId) return { conversation: { id: current.id, title: current.title, causaId: current.causaId, scopeKey: current.scopeKey, status: current.status, revision: current.revision }, reused: true };
  if (current && input.hasPendingAttachments) return { clarify: "Tienes adjuntos pendientes en la conversación anterior. Envíalos allí o retíralos antes de trabajar en otra causa." };
  return createAltazorConversation({ requestId: input.requestId, title: input.title || input.text.slice(0, 160) || "Nueva conversación", causaId }, actor, client);
}
