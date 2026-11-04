import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { minutaConfidentialWhere } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { can, canSome, type Capability } from "@/lib/auth/permissions";
import { isRole, STAFF_ROLES } from "@/lib/auth/roles";
import { assertCausaAccess, assertCausaCapability, assertEventMutation, documentReadWhere, plazoAccessWhere, relatedCausaWhere, requiredCausaWhere, siteAccessWhere, taskAccessWhere } from "@/lib/auth/causa-access";
import { canonicalJson, executeCommand, serializable } from "@/lib/command-execution";
import { withAssistantTransaction } from "./transaction-context";
import { readUndo, snapshotEntity, type UndoPayload } from "./plan-store";
import type { AssistantTool } from "./tools/types";
import type { ToolContext, ToolResult } from "./types";

class RejectedResult extends Error {
  constructor(readonly result: ToolResult) { super(result.message); }
}

async function refreshActor(ctx: ToolContext, db: Prisma.TransactionClient = prisma): Promise<ToolContext> {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!user || !isRole(user.role) || !STAFF_ROLES.includes(user.role) || !canSome(user, "assistant.use")) {
    throw httpError("Sin permiso para usar el asistente", 403);
  }
  return { ...ctx, role: user.role, capabilityGrants: user.capabilityGrants, capabilityRevokes: user.capabilityRevokes };
}

function toolCapability(id: string): Capability {
  if (id === "causa.vincular") return "causa.team.manage";
  if (id.startsWith("plazo.")) return "plazo.edit";
  if (id.startsWith("evento.")) return "evento.manage";
  if (id.startsWith("tarea.")) return "task.assign";
  if (id.startsWith("minuta.")) return "escrito.draft";
  return "causa.write";
}

/** Every direct tool entry point (preview/execute/undo) repeats current ACL. */
export async function assertToolInputAccess(
  id: string, input: Record<string, unknown>, ctx: ToolContext, write: boolean,
  db: Prisma.TransactionClient = prisma,
) {
  ctx.signal?.throwIfAborted();
  const actor = { ...ctx, id: ctx.userId };
  const capability = toolCapability(id);
  let causaId = typeof input.causaId === "string" ? input.causaId : null;
  let own = false;
  let eventResponsableId = typeof input.responsableId === "string" ? input.responsableId : ctx.userId;
  if (typeof input.documentoId === "string") {
    const doc = await db.documento.findFirst({ where: { id: input.documentoId, ...documentReadWhere(actor) } });
    if (!doc) throw httpError("Documento no encontrado o sin acceso", 404);
    causaId = doc.causaId;
    own = doc.autorId === ctx.userId;
  }
  if (typeof input.plazoId === "string") {
    const plazo = await db.plazo.findFirst({ where: { id: input.plazoId, ...plazoAccessWhere(actor) } });
    if (!plazo) throw httpError("Plazo no encontrado o sin acceso", 404);
    causaId = plazo.causaId;
    own = plazo.responsableId === ctx.userId;
  }
  if (typeof input.notaId === "string") {
    const note = await db.nota.findFirst({ where: { id: input.notaId, ...relatedCausaWhere(actor) } });
    if (!note) throw httpError("Nota no encontrada o sin acceso", 404);
    causaId = note.causaId;
  }
  if (typeof input.minutaId === "string") {
    const minuta = await db.minuta.findFirst({ where: { id: input.minutaId, ...minutaConfidentialWhere(actor), ...requiredCausaWhere(actor) } });
    if (!minuta) throw httpError("Minuta no encontrada o sin acceso", 404);
    causaId = minuta.causaId;
    own = minuta.autorId === ctx.userId;
  }
  if (typeof input.taskId === "string") {
    const task = await db.task.findFirst({ where: { id: input.taskId, ...taskAccessWhere(actor) }, include: { site: { select: { causaId: true } } } });
    if (!task) throw httpError("Tarea no encontrada o sin acceso", 404);
    causaId = task.causaId || task.site?.causaId || null;
    own = task.assigneeId === ctx.userId || task.creatorId === ctx.userId;
  }
  if (typeof input.eventoId === "string") {
    const event = await db.evento.findFirst({ where: { id: input.eventoId, ...relatedCausaWhere(actor) } });
    if (!event) throw httpError("Evento no encontrado o sin acceso", 404);
    causaId = event.causaId;
    own = event.responsableId === ctx.userId;
    eventResponsableId = event.responsableId;
  }
  if (typeof input.siteId === "string") {
    const site = await db.site.findFirst({ where: { id: input.siteId, ...siteAccessWhere(actor) }, select: { causaId: true } });
    if (!site) throw httpError("Espacio no encontrado o sin acceso", 404);
    causaId = site.causaId;
  }
  if (ctx.scope) {
    if (ctx.scope.causaId) await assertCausaAccess(ctx.scope.causaId, actor, undefined, db);
    // Global searches and legacy LLM tools have no pinned source/destination
    // contract. ALTAZOR uses its selected-source answer path for those tasks.
    if (["buscar", "causa.buscar", "documento.resumir", "documento.clasificar", "jurisprudencia.brief"].includes(id) || id === "documento.buscar" && !ctx.scope.causaId) throw httpError("Seleccione las fuentes de esta conversación para consultarlas con ALTAZOR", 409);
    const bound = causaId !== null || ["causaId", "documentoId", "plazoId", "notaId", "minutaId", "taskId", "eventoId", "siteId"].some(field => typeof input[field] === "string");
    if (bound && causaId !== ctx.scope.causaId) throw httpError("La acción pertenece a un ámbito distinto de esta conversación", 409);
  }
  if (write && id.startsWith("tarea.") && input.assigneeId && input.assigneeId !== ctx.userId && !can(actor, "task.assign")) {
    throw httpError("Sin permiso para asignar tareas a otros", 403);
  }
  if (write && id.startsWith("evento.")) {
    await assertEventMutation(actor, { responsableId: eventResponsableId, causaId }, db);
  } else if (causaId) {
    if (write) await assertCausaCapability(causaId, actor, capability, db);
    else await assertCausaAccess(causaId, actor, undefined, db);
  } else if (write) {
    const creating = !["documentoId", "notaId", "minutaId", "taskId", "eventoId"].some((field) => input[field]);
    const selfAssigned = creating && (!input.assigneeId || input.assigneeId === ctx.userId) && (!input.responsableId || input.responsableId === ctx.userId);
    if (!can(actor, capability, { own: own || selfAssigned })) throw httpError("Sin permiso para esta acción", 403);
  }
  for (const field of ["abogadoId", "assigneeId", "responsableId"]) {
    if (typeof input[field] !== "string" || !input[field]) continue;
    const referenced = await db.user.findFirst({ where: { id: input[field] as string, role: { in: [...STAFF_ROLES] } }, select: { id: true } });
    if (!referenced) throw httpError("Responsable no válido", 400);
  }
  if (typeof input.clienteId === "string" && input.clienteId) {
    const cliente = await db.cliente.findUnique({ where: { id: input.clienteId }, select: { id: true } });
    if (!cliente) throw httpError("Cliente no encontrado", 404);
  }
}

function undoInput(payload: UndoPayload, current: unknown): Record<string, unknown> {
  const row = (current || payload.before || {}) as Record<string, unknown>;
  const field: Record<string, string> = { Nota: "notaId", Documento: "documentoId", Task: "taskId", Evento: "eventoId", Minuta: "minutaId", Plazo: "plazoId", Causa: "causaId" };
  return { ...row, ...(field[payload.entityType] && current ? { [field[payload.entityType]]: payload.entityId } : {}) };
}

/** A committed deletion retains its original access boundary in its undo receipt. */
export async function authorizeCommittedResult(
  id: string, input: Record<string, unknown>, result: ToolResult | undefined,
  actor: ToolContext, tx: Prisma.TransactionClient,
) {
  if (id !== "evento.eliminar" || !result) {
    return assertToolInputAccess(id, input, actor, true, tx);
  }
  const record = result.undoToken ? await tx.assistantUndo.findFirst({ where: {
    id: result.undoToken, ownerId: actor.userId, toolId: id,
    entityType: "Evento", entityId: String(input.eventoId),
  } }) : null;
  if (!record) throw httpError("No se pudo verificar el acceso actual a la operación", 409);
  const payload = JSON.parse(record.payloadJson) as UndoPayload;
  if (payload.toolId !== id || payload.entityType !== "Evento" || payload.entityId !== input.eventoId || !payload.before) {
    throw httpError("No se pudo verificar el acceso actual a la operación", 409);
  }
  // Do not require the deleted row, but do recheck the original matter wall,
  // responsible user's agenda/delegation and all current actor capabilities.
  await assertToolInputAccess(id, undoInput(payload, null), actor, true, tx);
}

export function secureTool<T>(tool: AssistantTool<T>): AssistantTool<T> {
  return {
    ...tool,
    roles: [...STAFF_ROLES],
    async preview(raw, ctx) {
      const actor = await refreshActor(ctx);
      const input = tool.inputSchema.parse(raw);
      await assertToolInputAccess(tool.id, input as Record<string, unknown>, actor, tool.kind === "write");
      return tool.preview(input, actor);
    },
    async execute(raw, ctx) {
      const input = tool.inputSchema.parse(raw);
      if (tool.kind === "read") {
        const actor = await refreshActor(ctx);
        await assertToolInputAccess(tool.id, input as Record<string, unknown>, actor, false);
        return tool.execute(input, actor);
      }
      const actor = await refreshActor(ctx);
      try {
        return await executeCommand({
          ownerId: actor.userId,
          key: actor.commandKey || `assistant:${tool.id}:${randomUUID()}`,
          input: { toolId: tool.id, input },
          authorize: async (tx, committedResult) => {
            const currentActor = await refreshActor(actor, tx);
            await authorizeCommittedResult(tool.id, input as Record<string, unknown>, committedResult, currentActor, tx);
          },
          run: (tx) => withAssistantTransaction(tx, actor, async () => {
            const currentActor = await refreshActor(actor, tx);
            await assertToolInputAccess(tool.id, input as Record<string, unknown>, currentActor, true, tx);
            const result = await tool.execute(input, currentActor);
            if (!result.ok) throw new RejectedResult(result);
            return result;
          }),
        });
      } catch (error) {
        if (error instanceof RejectedResult) return error.result;
        throw error;
      }
    },
    ...(tool.undo ? { async undo(token: string, ctx: ToolContext) {
      return serializable(async (tx) => {
        const actor = await refreshActor(ctx, tx);
        const record = await readUndo(token, actor.userId, tool.id, tx);
        if (!record) throw httpError("Token de deshacer inválido, vencido o de otro usuario", 404);
        const payload = JSON.parse(record.payloadJson) as UndoPayload;
        const current = await snapshotEntity(tx, payload.entityType, payload.entityId);
        if (canonicalJson(current) !== record.expectedJson) {
          throw httpError("El recurso cambió después de esta acción. No se sobrescribieron los cambios", 409);
        }
        await assertToolInputAccess(tool.id, undoInput(payload, current), actor, true, tx);
        return withAssistantTransaction(tx, actor, async () => {
          const result = await tool.undo!(token, actor);
          if (!result.ok) throw new RejectedResult(result);
          return result;
        });
      });
    } } : {}),
  };
}
