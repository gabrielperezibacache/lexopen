import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { verifyAltazorSources, resolveAltazorSources } from "@/lib/altazor/resources";
import type { AltazorContext } from "@/lib/altazor/types";
import { desktopScope } from "./escritorio-access";
import type { ToolContext } from "../types";

export async function academicScope(ctx: ToolContext, db: Prisma.TransactionClient = prisma, historical = false) {
  return desktopScope(ctx, db, historical);
}
export async function selectedAcademicSources(ctx: ToolContext, db: Prisma.TransactionClient = prisma) {
  const { actor, conversationId } = await academicScope(ctx, db);
  const planId = ctx.commandKey ? /^assistant-plan:([^:]+):\d+$/.exec(ctx.commandKey)?.[1] : undefined;
  if (!planId && !ctx.nativeTurnId) throw httpError("No se pudo vincular la selección a este encargo. Vuelve a elegir tus fuentes en ALTAZOR.", 409);
  const turn = await db.altazorTurn.findFirst({ where: { conversationId, ownerId: actor.id, id: ctx.nativeTurnId, planId, status: { in: ["running", "awaiting_confirmation"] } }, select: { contextJson: true } });
  if (!turn) throw httpError("Elige las fuentes de esta conversación antes de preparar el trabajo académico.", 409);
  let snapshot: AltazorContext;
  try { snapshot = JSON.parse(turn.contextJson); } catch { throw httpError("La selección de fuentes no se pudo verificar. Vuelve a elegirla en la conversación.", 409); }
  if (!Array.isArray(snapshot.refs) || snapshot.refs.length > 8) throw httpError("Selecciona hasta ocho pasajes para este encargo académico.", 409);
  await verifyAltazorSources(actor, snapshot.refs, { client: db });
  return snapshot.refs.map(source => source.input);
}
export async function assertAcademicToolInputAccess(id: string, input: Record<string, unknown>, ctx: ToolContext, write: boolean, db: Prisma.TransactionClient = prisma) {
  const { actor } = await academicScope(ctx, db, !write);
  if (id === "academia.listar" || id === "academia.crear") return;
  if (id !== "academia.preparar" || typeof input.trabajoId !== "string") throw httpError("Selecciona un trabajo académico propio para preparar la propuesta.", 409);
  const workspace = await db.altazorAcademicWorkspace.findFirst({ where: { id: input.trabajoId, ownerId: actor.id, archivedAt: null }, select: { id: true } });
  if (!workspace) throw httpError("El trabajo académico no está disponible.", 404);
  const sources = Array.isArray(input.sources) ? input.sources : [];
  if (write) {
    const selected = await selectedAcademicSources(ctx, db);
    if (canonicalJson(selected) !== canonicalJson(sources)) throw httpError("Cambió la selección de fuentes. Prepara y revisa un nuevo encargo académico.", 409);
  }
  await resolveAltazorSources(actor, sources, { client: db });
}
