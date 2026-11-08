import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { createIcaroJob, listIcaros } from "@/lib/altazor/icaros/service";
import { icaroDestination } from "@/lib/altazor/icaros/destination";
import { icaroProfile, icaroScope, icaroSelectedSources } from "./icaro-access";
import type { AssistantPlan, ToolContext } from "../types";
import type { AssistantTool } from "./types";

export const icaroListarSchema = z.object({}).strict();
export const icaroDelegarSchema = z.object({
  icaroId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/), instruction: z.string().trim().min(1).max(6000),
  profileRevision: z.number().int().positive(), destinationKey: z.string().regex(/^[a-f0-9]{64}$/), sourceKey: z.string().regex(/^[a-f0-9]{64}$/), useMemory: z.boolean(),
}).strict();
type Delegation = z.infer<typeof icaroDelegarSchema>;
const normalizedName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");

export async function resolveIcaroToolInput(input: Record<string, unknown>, ctx: ToolContext, originalText: string) {
  const scope = await icaroScope(ctx), text = normalizedName(originalText);
  let id = typeof input.icaroId === "string" ? input.icaroId : "";
  if (id && !originalText.includes(id)) throw httpError("Indica el nombre del Ícaro o su identificador explícito.", 409);
  if (!id) {
    const name = typeof input.icaroName === "string" ? normalizedName(input.icaroName) : "";
    if (!name || !text.includes(name)) throw httpError("Indica a qué Ícaro quieres delegar el encargo.", 409);
    const profiles = await prisma.altazorIcaro.findMany({ where: { ownerId: scope.actor.id, causaId: scope.causaId, scopeKey: scope.scopeKey, enabled: true }, select: { id: true, name: true }, take: 20 });
    const matches = profiles.filter(profile => profile.id === input.icaroName || normalizedName(profile.name) === name);
    if (matches.length !== 1) throw httpError(matches.length ? "Hay varios Ícaros con ese nombre. Indica el identificador del perfil elegido." : "No hay un Ícaro activo con ese nombre en esta conversación.", 409);
    id = matches[0].id;
  }
  const { actor, profile } = await icaroProfile(ctx, id, true), selected = await icaroSelectedSources(ctx), destination = await icaroDestination(actor.id, profile);
  if (!destination.permitted) throw httpError("El proveedor del Ícaro no está permitido o no tiene modelo configurado.", 409);
  return { icaroId: id, instruction: input.instruction, profileRevision: profile.revision, destinationKey: destination.key, sourceKey: selected.sourceKey, useMemory: profile.memoryEnabled && !/\bsin\s+(?:(?:su|la)\s+)?memoria\b/.test(text) };
}
async function preview(input: Delegation, ctx: ToolContext) {
  const { actor, profile } = await icaroProfile(ctx, input.icaroId, true), selected = await icaroSelectedSources(ctx), destination = await icaroDestination(actor.id, profile);
  if (profile.revision !== input.profileRevision || destination.key !== input.destinationKey || selected.sourceKey !== input.sourceKey || !destination.permitted || input.useMemory && !profile.memoryEnabled) throw httpError("El perfil, destino o fuentes cambiaron. Prepara un encargo nuevo.", 409);
  return `Delegar a Ícaro «${profile.name}».\nModelo: ${destination.model} · proveedor: ${destination.provider} · ${destination.remote ? "remoto" : "local"}.\nDestino: ${destination.endpoint}.\nFuentes seleccionadas para compartir: ${selected.refs.length}. Memoria propia del Ícaro: ${input.useMemory ? "activada" : "no se usará"}.\nEl historial, la memoria y los adjuntos de la conversación no se copian al encargo.\n\n${input.instruction}\n\nEl encargo se pondrá en cola; Altazor mostrará su resultado cuando termine.`;
}
export const icaroListarTool: AssistantTool<z.infer<typeof icaroListarSchema>> = {
  id: "icaro.listar", description: "Consulta los perfiles Ícaros propios del ámbito actual, su modelo y memoria independiente.", kind: "read", roles: [...STAFF_ROLES], inputSchema: icaroListarSchema,
  async preview(raw, ctx) { icaroListarSchema.parse(raw); await icaroScope(ctx); return "Consultar tus Ícaros disponibles en esta conversación."; },
  async execute(raw, ctx) {
    icaroListarSchema.parse(raw); const scope = await icaroScope(ctx), { icaros } = await listIcaros(scope.actor, { causaId: scope.causaId });
    return { ok: true, message: icaros.length ? icaros.map(profile => `${profile.name} (${profile.id}) · ${profile.destination.model || "sin modelo"} · memoria propia ${profile.memoryEnabled ? "activada" : "desactivada"}${profile.enabled ? "" : " · desactivado"}`).join("\n") : "No tienes Ícaros en este ámbito. Crea un perfil y elige su modelo antes de delegarle una tarea.", card: { type: "icaros", href: "/inicio?altazor=icaros", profiles: icaros.map(profile => ({ id: profile.id, name: profile.name, model: profile.destination.model, enabled: profile.enabled })) } };
  },
};
export const icaroDelegarTool: AssistantTool<Delegation> = {
  id: "icaro.delegar", description: "Prepara y confirma un encargo para un Ícaro propio, con perfil, modelo, memoria y fuentes fijados en el plan.", kind: "write", roles: [...STAFF_ROLES], inputSchema: icaroDelegarSchema,
  async preview(raw, ctx) { return preview(icaroDelegarSchema.parse(raw), ctx); },
  async execute(raw, ctx) {
    const input = icaroDelegarSchema.parse(raw), match = /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(ctx.commandKey || "");
    if (!match || !ctx.authorizeContext || !ctx.nativeTurnId) throw httpError("Confirma este encargo desde el plan de una conversación nativa de Altazor.", 409);
    const selected = await icaroSelectedSources(ctx), index = Number(match[2]);
    const record = await prisma.assistantPlanRecord.findFirst({ where: { id: match[1], ownerId: selected.actor.id, expiresAt: { gt: new Date() }, status: { not: "cancelled" } } });
    let plan: AssistantPlan | undefined;
    try { plan = record ? JSON.parse(record.planJson) : undefined; } catch { /* Fail closed. */ }
    const step = plan?.steps[index], turn = selected.turn;
    if (!plan?.needsConfirm || plan.id !== match[1] || step?.toolId !== "icaro.delegar" || canonicalJson(step.input) !== canonicalJson(input) || step.preview !== await preview(input, ctx) || turn.planId !== plan.id || turn.status !== "running" || !turn.leaseToken || !turn.leaseExpiresAt || turn.leaseExpiresAt <= new Date()) throw httpError("El plan delegado cambió, no está confirmado o venció. Prepara uno nuevo.", 409);
    await ctx.authorizeContext(); ctx.signal?.throwIfAborted();
    const { actor, profile } = await icaroProfile(ctx, input.icaroId, true), destination = await icaroDestination(actor.id, profile);
    const { job } = await createIcaroJob(input.icaroId, { requestId: `assistant-icaro:${digest(`${actor.id}:${ctx.commandKey}`)}`, instruction: input.instruction, text: "", sources: [], useMemory: input.useMemory, allowRemote: destination.remote, destinationKey: input.destinationKey, parentJobId: null, confirmed: true }, actor, { sources: selected.refs, authorizeContext: ctx.authorizeContext, origin: { conversationId: selected.conversationId, turnId: turn.id } });
    return { ok: true, message: `Encargo delegado a Ícaro «${profile.name}». Estado: ${job.status}. Altazor lo seguirá desde esta conversación.`, entityId: job.id, card: { type: "icaro", id: job.id, jobId: job.id, icaroId: profile.id, name: profile.name, status: job.status, href: "/inicio?altazor=icaros" } };
  },
};
