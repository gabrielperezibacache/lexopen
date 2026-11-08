import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { sendComputerMessage } from "@/lib/altazor/computer/service";
import { desktopScope, desktopSession, listDesktopSessions } from "./escritorio-access";
import type { AssistantPlan, ToolContext } from "../types";
import type { AssistantTool } from "./types";

export const escritorioListarSchema = z.object({}).strict();
export const escritorioEncargarSchema = z.object({ sessionId: z.string().min(1).max(100), texto: z.string().trim().min(1).max(4000) }).strict();
type Task = z.infer<typeof escritorioEncargarSchema>;
export function desktopHref(sessionId: string | null, causaId: string | null) {
  const query = new URLSearchParams({ altazor: "computer", ...(sessionId ? { escritorio: sessionId } : {}), ...(causaId ? { causaId } : {}) });
  return `/inicio?${query}`;
}
export async function resolveDesktopTaskInput(input: Record<string, unknown>, ctx: ToolContext) {
  if (typeof input.sessionId === "string" && input.sessionId) return input;
  const sessions = await listDesktopSessions(ctx);
  if (sessions.length !== 1) throw httpError(sessions.length ? "Indique cuál de sus escritorios activos debe recibir el encargo." : "Abra un escritorio de este ámbito antes de encargarle una tarea.", 409);
  return { ...input, sessionId: sessions[0].id };
}
async function taskPreview(input: Task, ctx: ToolContext) {
  const access = await desktopSession(ctx, input.sessionId, true);
  const apps = access.connectors.map(name => /^altazor-google-[a-f0-9]{16}$/.test(name) ? "Google Drive" : /^altazor-github-[a-f0-9]{16}$/.test(name) ? "GitHub (repositorios públicos)" : name);
  return `Altazor realizará este encargo en su escritorio, con el modelo ${access.session.workspace.providerName}. Es un entorno de IA independiente del chat; puede usar un proveedor remoto.\nAplicaciones elegidas: ${apps.join(", ") || "ninguna"}.\n\n${input.texto}\n\nGoogle Drive y GitHub se usarán sólo para consultar o descargar los archivos solicitados. Cada acceso esperará su autorización. Podrá ver el avance y detener el trabajo desde la conversación. No se adjuntarán documentos ni se copiarán memoria o secretos automáticamente.`;
}
async function confirmedTask(input: Task, ctx: ToolContext) {
  if (!ctx.commandKey || !ctx.authorizeContext) throw httpError("Confirme el plan desde la conversación de ALTAZOR antes de enviar el encargo.", 409);
  const match = /^assistant-plan:(altazor-[A-Za-z0-9-]{1,100}):([0-9]{1,3})$/.exec(ctx.commandKey);
  if (!match) throw httpError("Este encargo necesita un plan confirmado de ALTAZOR.", 409);
  const { actor, conversationId } = await desktopScope(ctx), index = Number(match[2]);
  const record = await prisma.assistantPlanRecord.findFirst({ where: { id: match[1], ownerId: actor.id, expiresAt: { gt: new Date() }, status: { not: "cancelled" } } });
  let plan: AssistantPlan | undefined;
  try { plan = record ? JSON.parse(record.planJson) as AssistantPlan : undefined; } catch { /* Fail closed below. */ }
  const step = plan?.steps[index];
  if (!plan?.needsConfirm || plan.id !== match[1] || !step || step.toolId !== "escritorio.encargar" || canonicalJson(step.input) !== canonicalJson(input) || step.preview !== await taskPreview(input, ctx)) throw httpError("El encargo o su destino cambió. Prepare y revise un nuevo plan.", 409);
  const turn = await prisma.altazorTurn.findFirst({ where: { planId: plan.id, conversationId, ownerId: actor.id, status: "running", cancelRequestedAt: null, leaseToken: { not: null }, leaseExpiresAt: { gt: new Date() } }, select: { id: true } });
  if (!turn) throw httpError("El plan no está confirmado, fue cancelado o perdió su autorización de ejecución.", 409);
  await ctx.authorizeContext(); ctx.signal?.throwIfAborted();
  return { actor, requestId: `assistant-desktop:${digest(`${actor.id}:${ctx.commandKey}`)}` };
}

export const escritorioListarTool: AssistantTool<z.infer<typeof escritorioListarSchema>> = {
  id: "escritorio.listar", description: "Lista sus escritorios existentes y aplicaciones autorizadas del ámbito actual de ALTAZOR.", kind: "read", roles: [...STAFF_ROLES], inputSchema: escritorioListarSchema,
  async preview(raw, ctx) { escritorioListarSchema.parse(raw); await desktopScope(ctx); return "Consultar sus escritorios activos de esta conversación, con sus proveedores y conexiones autorizadas."; },
  async execute(raw, ctx) {
    escritorioListarSchema.parse(raw);
    const sessions = await listDesktopSessions(ctx);
    return { ok: true, message: sessions.length ? sessions.map(row => `Escritorio ${row.id}: proveedor ${row.provider}; aplicaciones: ${row.connectors.join(", ") || "ninguna"}${row.held ? "; control manual" : ""}.`).join("\n") : "No hay un escritorio activo en este ámbito. Abra uno y seleccione sus conexiones antes de preparar un encargo.", card: { type: "escritorio", id: sessions.length === 1 ? sessions[0].id : null, causaId: ctx.scope!.causaId, href: desktopHref(sessions.length === 1 ? sessions[0].id : null, ctx.scope!.causaId), sessions } };
  },
};

// The Computer broker owns the durable one-use receipt. Do not wrap an external
// send in secureTool/executeCommand: those retry serializable domain transactions.
export const escritorioEncargarTool: AssistantTool<Task> = {
  id: "escritorio.encargar", description: "Prepara un encargo de texto, revisable y confirmado, para un escritorio ya abierto del ámbito actual. No crea escritorios ni copia archivos o secretos.", kind: "write", roles: [...STAFF_ROLES], inputSchema: escritorioEncargarSchema,
  async preview(raw, ctx) { return taskPreview(escritorioEncargarSchema.parse(raw), ctx); },
  async execute(raw, ctx) {
    const input = escritorioEncargarSchema.parse(raw), authorization = await confirmedTask(input, ctx);
    const access = await desktopSession(ctx, input.sessionId, true);
    await ctx.authorizeContext!(); ctx.signal?.throwIfAborted();
    const result = await sendComputerMessage(authorization.actor, input.sessionId, { requestId: authorization.requestId, text: input.texto, files: [], confirmed: true });
    const ok = result.status === "completed";
    return { ok, message: ok ? `Encargo enviado al escritorio ${input.sessionId}, con el proveedor ${access.session.workspace.providerName}. Revise allí el avance y las autorizaciones de sus aplicaciones.` : "El escritorio no confirmó el encargo. Revise su estado; no se reenviará automáticamente.", entityId: input.sessionId, card: { type: "escritorio", id: input.sessionId, causaId: access.causaId, href: desktopHref(input.sessionId, access.causaId), provider: access.session.workspace.providerName, connectors: access.connectors, status: result.status } };
  },
};
