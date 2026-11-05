import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { verifyAltazorSources } from "@/lib/altazor/resources";
import type { AltazorContext } from "@/lib/altazor/types";
import { workspaceFor } from "@/lib/hearings/access";
import { readCaseWriting } from "@/lib/writings/service";
import { desktopScope } from "./escritorio-access";
import type { ToolContext, ToolResult } from "../types";
export async function workflowScope(ctx: ToolContext, db: Prisma.TransactionClient = prisma, historical = false) {
  const scope = await desktopScope(ctx, db, historical);
  if (!scope.causaId) throw httpError("Abre una conversación de la causa para trabajar en sus audiencias o escritos.",409);
  return { ...scope, causaId:scope.causaId };
}
export async function savedAnswer(input: Record<string,unknown>, ctx: ToolContext, db: Prisma.TransactionClient = prisma) {
  const scope = await workflowScope(ctx,db,true);
  const turn = typeof input.sourceTurnId === "string" ? await db.altazorTurn.findFirst({where:{id:input.sourceTurnId,conversationId:scope.conversationId,ownerId:scope.actor.id,status:"completed"},select:{assistantText:true,contextJson:true}}) : null;
  if (!turn || !turn.assistantText.trim()) throw httpError("Prepara primero una respuesta con tus fuentes y después pide guardarla como escrito.",409);
  let snapshot: AltazorContext; try { snapshot = JSON.parse(turn.contextJson); } catch { throw httpError("La respuesta necesita revisar sus fuentes.",409); }
  await verifyAltazorSources(scope.actor,snapshot.refs,{causaId:scope.causaId,client:db});
  return { ...scope,turn,snapshot };
}
/** A saved answer must be one of the current turn's already verified parents. */
export async function currentAnswerParent(ctx: ToolContext, db: Prisma.TransactionClient = prisma) {
  const scope = await workflowScope(ctx, db), running = ctx.nativeTurnId ? await db.altazorTurn.findFirst({ where: { id: ctx.nativeTurnId, conversationId: scope.conversationId, ownerId: scope.actor.id, status: { in: ["running", "awaiting_confirmation", "partial"] }, cancelRequestedAt: null }, select: { contextJson: true } }) : null;
  let snapshot: AltazorContext | undefined;
  try { snapshot = running ? JSON.parse(running.contextJson) : undefined; } catch { /* Fail closed. */ }
  const sourceTurnId = Array.isArray(snapshot?.historyTurnIds) ? snapshot.historyTurnIds.at(-1) : undefined;
  if (!sourceTurnId) throw httpError("Prepara primero una respuesta disponible con tus fuentes y luego pide guardarla como escrito.",409);
  return sourceTurnId;
}
export async function assertWorkflowToolInputAccess(id:string,input:Record<string,unknown>,ctx:ToolContext,write:boolean,db:Prisma.TransactionClient=prisma) {
  const scope = await workflowScope(ctx,db,!write);
  if (write) await assertCausaCapability(scope.causaId,scope.actor,id.startsWith("escrito.") ? "escrito.draft" : "causa.write",db);
  if (id === "audiencia.nota") {
    if (typeof input.workspaceId !== "string") throw httpError("Elige una audiencia de esta causa.",409);
    await workspaceFor(scope.causaId,input.workspaceId,scope.actor,db,write);
  }
  if (id === "escrito.guardar") {
    if (write && input.sourceTurnId !== await currentAnswerParent(ctx,db)) throw httpError("La respuesta seleccionada cambió. Prepara un plan nuevo.",409);
    await savedAnswer(input,ctx,db);
  }
}
export async function authorizeWorkflowResult(id:string,input:Record<string,unknown>,result:ToolResult|undefined,ctx:ToolContext,db:Prisma.TransactionClient) {
  await assertWorkflowToolInputAccess(id,input,ctx,false,db);
  const scope = await workflowScope(ctx,db,true);
  if (id === "escrito.guardar" && result?.entityId) await readCaseWriting(scope.causaId,result.entityId,scope.actor,db);
  if (id === "audiencia.crear" && result?.entityId) await workspaceFor(scope.causaId,result.entityId,scope.actor,db);
}
