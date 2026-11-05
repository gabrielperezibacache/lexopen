import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { workbenchDestination } from "@/lib/workbench/policy";
import { createAcademicWorkspace, prepareAcademicArtifact } from "@/lib/altazor/academic";
import { academicModeSchema, ACADEMIC_LABELS } from "@/lib/altazor/academic-schemas";
import { altazorSourceInputSchema } from "@/lib/altazor/resource-input";
import { academicHref } from "@/lib/altazor/academic-templates";
import { secureTool } from "../secure-tool";
import { assistantDb as db } from "../transaction-context";
import type { AssistantPlan, ToolContext } from "../types";
import type { AssistantTool } from "./types";
import { academicScope, assertAcademicToolInputAccess, selectedAcademicSources } from "./academic-access";
export { assertAcademicToolInputAccess } from "./academic-access";

export const academiaListarSchema = z.object({}).strict();
export const academiaCrearSchema = z.object({ titulo: z.string().trim().min(1).max(200), tipo: z.enum(["research", "writing", "course", "career"]).default("research") }).strict();
export const academiaPrepararSchema = z.object({ trabajoId: z.string().min(1).max(100), expectedRevision: z.number().int().positive(), mode: academicModeSchema, instruction: z.string().trim().min(1).max(12000), sources: z.array(altazorSourceInputSchema).max(8), destinationKey: z.string().length(64), allowRemote: z.boolean().default(false) }).strict();
type Prepare = z.infer<typeof academiaPrepararSchema>;

/** Revision, provider and source IDs always come from current server state. */
export async function resolveAcademicToolInput(id: string, input: Record<string, unknown>, ctx: ToolContext) {
  if (id !== "academia.preparar") return input;
  const { actor } = await academicScope(ctx);
  if (typeof input.trabajoId !== "string" || !input.trabajoId) throw httpError("Abre el trabajo académico o indica cuál de tus trabajos quieres continuar.", 409);
  const workspace = await db.altazorAcademicWorkspace.findFirst({ where: { id: input.trabajoId, ownerId: actor.id, archivedAt: null }, select: { revision: true } });
  if (!workspace) throw httpError("El trabajo académico no está disponible.", 404);
  const destination = await workbenchDestination(actor.id, "assisted_draft");
  return { ...input, expectedRevision: workspace.revision, sources: await selectedAcademicSources(ctx), destinationKey: destination.key, allowRemote: destination.remote };
}
async function confirmed(id: string, input: unknown, ctx: ToolContext) {
  if (!ctx.commandKey || !ctx.authorizeContext) throw httpError("Confirma el encargo desde tu conversación con ALTAZOR.", 409);
  const match = /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(ctx.commandKey);
  if (!match) throw httpError("Este trabajo necesita un plan confirmado de ALTAZOR.", 409);
  const { actor, conversationId } = await academicScope(ctx, db), record = await db.assistantPlanRecord.findFirst({ where: { id: match[1], ownerId: actor.id, expiresAt: { gt: new Date() }, status: { not: "cancelled" } }, select: { planJson: true } });
  let plan: AssistantPlan | undefined;
  try { plan = record ? JSON.parse(record.planJson) : undefined; } catch { /* Fail closed. */ }
  const step = plan?.steps[Number(match[2])];
  if (!plan?.needsConfirm || !step || step.toolId !== id || canonicalJson(step.input) !== canonicalJson(input)) throw httpError("Cambió el encargo académico. Prepara y confirma un nuevo plan.", 409);
  if (!await db.altazorTurn.findFirst({ where: { planId: plan.id, conversationId, ownerId: actor.id, status: "running", cancelRequestedAt: null, leaseToken: { not: null }, leaseExpiresAt: { gt: new Date() } }, select: { id: true } })) throw httpError("Este plan ya no tiene autorización de ejecución.", 409);
  await ctx.authorizeContext(); ctx.signal?.throwIfAborted();
  return { actor, requestId: `academic-${digest(`${actor.id}:${ctx.commandKey}`)}` };
}
export const academiaListarTool: AssistantTool<z.infer<typeof academiaListarSchema>> = secureTool({
  id: "academia.listar", description: "Consulta los trabajos académicos privados del profesional y ofrece enlaces para continuarlos.", kind: "read", roles: [...STAFF_ROLES], inputSchema: academiaListarSchema,
  preview() { return "Consultar tus trabajos académicos privados. No se consultan causas ni se comparten documentos."; },
  async execute(_input, ctx) {
    const { actor } = await academicScope(ctx, db), workspaces = await db.altazorAcademicWorkspace.findMany({ where: { ownerId: actor.id, archivedAt: null }, select: { id: true, title: true, kind: true }, orderBy: { updatedAt: "desc" }, take: 100 });
    return { ok: true, message: workspaces.length ? workspaces.map(item => `${item.title} (${item.id})`).join("\n") : "Aún no tienes trabajos académicos. Puedes crear uno para investigar, escribir o enseñar.", card: { type: "academia", href: academicHref(workspaces.length === 1 ? workspaces[0].id : undefined), workspaces: workspaces.map(item => ({ ...item, href: academicHref(item.id) })) } };
  },
});
export const academiaCrearTool: AssistantTool<z.infer<typeof academiaCrearSchema>> = secureTool({
  id: "academia.crear", description: "Crea un trabajo académico privado tras revisar y confirmar el título y propósito.", kind: "write", roles: [...STAFF_ROLES], inputSchema: academiaCrearSchema,
  preview(input) { return `Crear el trabajo académico privado «${input.titulo}» (${({ research: "investigación", writing: "escritura", course: "docencia", career: "carrera académica" })[input.tipo]}). No se copian documentos ni fuentes de las causas y no se consulta un proveedor de IA.`; },
  async execute(input, ctx) {
    const { actor, requestId } = await confirmed("academia.crear", input, ctx), result = await createAcademicWorkspace({ requestId, title: input.titulo, kind: input.tipo }, actor, db);
    return { ok: true, message: `Trabajo privado «${input.titulo}» creado. Continúa con tu objetivo y elige las fuentes en Académico.`, entityId: result.id, card: { type: "academia", id: result.id, href: academicHref(result.id) } };
  },
});
export const academiaPrepararTool: AssistantTool<Prepare> = secureTool({
  id: "academia.preparar", description: "Conserva un encargo académico con los pasajes elegidos en la conversación. No llama al modelo ni publica; se ejecuta y revisa desde Académico.", kind: "write", roles: [...STAFF_ROLES], inputSchema: academiaPrepararSchema,
  async preview(input, ctx) {
    await assertAcademicToolInputAccess("academia.preparar", input, ctx, true);
    const destination = await workbenchDestination(ctx.userId, "assisted_draft");
    if (destination.key !== input.destinationKey) throw httpError("Cambió el proveedor académico. Prepara otro encargo.", 409);
    return `Conservar un encargo de ${ACADEMIC_LABELS[input.mode]} en tu trabajo académico ${input.trabajoId}, versión ${input.expectedRevision}. Se usarán exclusivamente los ${input.sources.length} pasajes que elegiste en esta conversación, más las filas incluidas de la matriz del trabajo.\n\nEncargo completo:\n${input.instruction}\n\nProveedor para su ejecución posterior: ${destination.provider}, ${destination.model}, ${destination.endpoint}${destination.remote ? " (remoto). Al ejecutar el encargo desde Académico se enviarán allí el encargo y sus fuentes, junto con las filas incluidas de la matriz y, si preparas un CV, el perfil académico guardado." : " (local)."}\nEsta confirmación conserva la preparación; no envía una consulta a la IA, no incorpora el texto a una causa y no publica. Ejecuta y revisa la propuesta desde Académico.`;
  },
  async execute(input, ctx) {
    const { actor, requestId } = await confirmed("academia.preparar", input, ctx);
    const result = await prepareAcademicArtifact(input.trabajoId, { requestId, expectedRevision: input.expectedRevision, mode: input.mode, instruction: input.instruction, sources: input.sources, destinationKey: input.destinationKey, allowRemote: input.allowRemote }, actor, db);
    return { ok: true, message: "Encargo académico conservado con sus fuentes. Ábrelo en Académico para ejecutarlo y revisar la propuesta.", entityId: result.artifact.id, card: { type: "academia", workspaceId: input.trabajoId, id: result.artifact.id, href: academicHref(input.trabajoId, result.artifact.id) } };
  },
});
