import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { icaroDestination } from "@/lib/altazor/icaros/destination";
import { readIcaroJob } from "@/lib/altazor/icaros/service";
import { verifyAltazorSources, type AltazorSourceSnapshot } from "@/lib/altazor/resources";
import { desktopScope } from "./escritorio-access";
import type { ToolContext, ToolResult } from "../types";

export const icaroScope = desktopScope;
export async function icaroProfile(ctx: ToolContext, id: string, live: boolean, db: Prisma.TransactionClient = prisma) {
  const scope = await icaroScope(ctx, db, !live);
  const profile = await db.altazorIcaro.findFirst({ where: { id, ownerId: scope.actor.id, causaId: scope.causaId, scopeKey: scope.scopeKey } });
  if (!profile) throw httpError("El Ícaro no pertenece a esta conversación o ya no está disponible.", 404);
  if (live && !profile.enabled) throw httpError("El Ícaro está desactivado. Selecciona otro perfil.", 409);
  return { ...scope, profile };
}
/** Only the durable native turn's selected source proofs can cross the delegation boundary. */
export async function icaroSelectedSources(ctx: ToolContext, db: Prisma.TransactionClient = prisma) {
  const scope = await icaroScope(ctx, db);
  if (!ctx.nativeTurnId) throw httpError("Prepara la delegación desde un mensaje nativo de Altazor.", 409);
  const turn = await db.altazorTurn.findFirst({ where: { id: ctx.nativeTurnId, conversationId: scope.conversationId, ownerId: scope.actor.id, cancelRequestedAt: null } });
  let snapshot: { version: number; refs: AltazorSourceSnapshot[] } | undefined;
  try { snapshot = turn ? JSON.parse(turn.contextJson) : undefined; } catch { /* Fail closed. */ }
  if (!turn || !snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.refs) || snapshot.refs.length > 8) throw httpError("No se pudieron verificar las fuentes seleccionadas del encargo.", 409);
  await verifyAltazorSources(scope.actor, snapshot.refs, { causaId: scope.causaId, client: db });
  return { ...scope, turn, refs: snapshot.refs, sourceKey: sha256(canonicalJson(snapshot.refs)) };
}
export async function assertIcaroToolInputAccess(id: string, input: Record<string, unknown>, ctx: ToolContext, write: boolean, db: Prisma.TransactionClient = prisma) {
  if (id === "icaro.listar") { await icaroScope(ctx, db, !write); return; }
  if (typeof input.icaroId !== "string") throw httpError("Selecciona un Ícaro de este ámbito.", 409);
  const access = await icaroProfile(ctx, input.icaroId, write, db);
  if (write) {
    const selected = await icaroSelectedSources(ctx, db), destination = await icaroDestination(access.actor.id, access.profile);
    if (access.profile.revision !== input.profileRevision || destination.key !== input.destinationKey || selected.sourceKey !== input.sourceKey || !destination.permitted) throw httpError("El perfil, proveedor o fuentes del Ícaro cambiaron. Prepara un plan nuevo.", 409);
  }
}
export async function authorizeIcaroResult(input: Record<string, unknown>, result: ToolResult, ctx: ToolContext, db: Prisma.TransactionClient = prisma) {
  await assertIcaroToolInputAccess("icaro.delegar", input, ctx, false, db);
  const scope = await icaroScope(ctx, db, true);
  if (!result.entityId) throw httpError("No se pudo verificar el encargo delegado.", 409);
  const row = await db.altazorIcaroJob.findFirst({ where: { id: result.entityId, ownerId: scope.actor.id, icaroId: String(input.icaroId) }, select: { contextJson: true } });
  let origin: { conversationId?: string; turnId?: string } | undefined;
  try { origin = row ? JSON.parse(row.contextJson).origin : undefined; } catch { /* Fail closed. */ }
  if (!origin || origin.conversationId !== scope.conversationId || origin.turnId !== ctx.nativeTurnId) throw httpError("El encargo delegado no pertenece a este mensaje.", 404);
  const { job } = await readIcaroJob(result.entityId, scope.actor);
  if (!job.available) throw httpError("Las fuentes del encargo ya no están disponibles.", 404);
}
