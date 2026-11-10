import { activeComputerSessionWhere } from "@/lib/altazor/computer/lifecycle";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { assertComputerEnabled, assertSessionLive } from "@/lib/altazor/computer/policy";
import { assertComputerPolicy } from "@/lib/altazor/computer/privacy";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { normalizeConnectorNames } from "@/lib/altazor/connectors/policy";
import type { ToolContext } from "../types";

type Client = Prisma.TransactionClient;
export async function desktopScope(ctx: ToolContext, db: Client = prisma, historical = false) {
  ctx.signal?.throwIfAborted();
  if (!ctx.scope || !ctx.chatId || !Object.prototype.hasOwnProperty.call(ctx.scope, "causaId")) throw httpError("Use esta herramienta desde una conversación de ALTAZOR con su ámbito seleccionado.", 409);
  const actor = await altazorActor({ ...ctx, id: ctx.userId }, db), causaId = ctx.scope.causaId;
  const conversation = await db.altazorConversation.findFirst({ where: { id: ctx.chatId, ownerId: actor.id, causaId, scopeKey: altazorScopeKey(causaId), status: historical ? { in: ["active", "archived"] } : "active" }, select: { id: true } });
  if (!conversation) throw httpError("La conversación no pertenece a este ámbito actual.", 404);
  if (causaId) await assertCausaAccess(causaId, actor, { auditOverride: false }, db);
  return { actor, causaId, scopeKey: altazorScopeKey(causaId), conversationId: conversation.id };
}
export function desktopConnectorNames(value: string) {
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw httpError("La selección del escritorio necesita revisión.", 409); }
  if (!Array.isArray(raw) || raw.some(name => typeof name !== "string")) throw httpError("La selección del escritorio necesita revisión.", 409);
  const names = normalizeConnectorNames(raw.length ? raw : ["-"]); return names[0] === "-" ? [] : names;
}
export async function desktopSession(ctx: ToolContext, sessionId: string, live: boolean, db: Client = prisma) {
  const scope = await desktopScope(ctx, db, !live);
  const session = await db.altazorComputerSession.findFirst({ where: { id: sessionId, ownerId: scope.actor.id }, select: {
    id: true, state: true, expiresAt: true, held: true, updatedAt: true, connectorNamesJson: true, kittyId: true, chatId: true,
    workspace: { select: { id: true, ownerId: true, causaId: true, scopeKey: true, enabled: true, providerName: true } },
  } });
  if (!session || session.workspace.ownerId !== scope.actor.id || session.workspace.causaId !== scope.causaId || session.workspace.scopeKey !== scope.scopeKey) throw httpError("El escritorio no pertenece a esta conversación o ya no tiene acceso.", 404);
  if (live) {
    assertComputerEnabled(); assertSessionLive(session);
    if (!session.workspace.enabled || !session.kittyId || !session.chatId) throw httpError("Abra y compruebe el escritorio antes de preparar este encargo.", 409);
    assertComputerPolicy(normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } })).assistantLlmMode);
    if (session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000) throw httpError("Devuelva el control al asistente antes de enviar un encargo.", 409);
  }
  return { ...scope, session, connectors: desktopConnectorNames(session.connectorNamesJson) };
}
export async function listDesktopSessions(ctx: ToolContext, db: Client = prisma) {
  const scope = await desktopScope(ctx, db);
  const sessions = await db.altazorComputerSession.findMany({ where: {
    ownerId: scope.actor.id, state: { in: ["ready", "starting"] }, ...activeComputerSessionWhere(), kittyId: { not: null }, chatId: { not: null },
    workspace: { ownerId: scope.actor.id, causaId: scope.causaId, scopeKey: scope.scopeKey, enabled: true, credentialEnc: { not: null } },
  }, select: { id: true, state: true, expiresAt: true, held: true, updatedAt: true, connectorNamesJson: true, workspace: { select: { id: true, providerName: true } } }, take: 10, orderBy: { createdAt: "desc" } });
  return sessions.map(row => ({ id: row.id, state: row.state, expiresAt: row.expiresAt?.toISOString() ?? null, held: row.held && Date.now() - row.updatedAt.getTime() < 5 * 60_000, workspaceId: row.workspace.id, provider: row.workspace.providerName, connectors: desktopConnectorNames(row.connectorNamesJson), causaId: scope.causaId }));
}
/** Called by the planner and history reader as well as direct tool entry points. */
export async function assertDesktopToolInputAccess(id: string, input: Record<string, unknown>, ctx: ToolContext, write: boolean, db: Client = prisma) {
  if (id === "escritorio.listar") { await desktopScope(ctx, db, !write); return; }
  if (typeof input.sessionId !== "string" || !input.sessionId) throw httpError("Seleccione un escritorio existente para el encargo.", 409);
  await desktopSession(ctx, input.sessionId, write, db);
}
