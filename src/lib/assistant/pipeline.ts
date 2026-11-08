import { getWorkCountry } from "@/lib/config/work-country";
/**
 * Orquestación del turno del asistente: normalize → classify → resolve
 * entidades → plan ordenado → (confirmación humana en escrituras) → execute.
 * Reutiliza el dominio existente vía `tools/registry` (nunca duplica lógica).
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/auth/rbac";
import { normalizeAssistantInput } from "./normalize";
import { classifyIntents } from "./classify";
import { getAssistantFirmPolicy } from "./firm-policy";
import { getTool } from "./tools/registry";
import { storePlan } from "./plan-store";
import { resolveDesktopTaskInput } from "./tools/escritorio";
import { resolveAcademicToolInput } from "./tools/academic";
import { resolveWorkflowToolInput } from "./tools/workflow";
import { resolveLibrarySyncInput } from "./tools/library-sync";
import { resolveDriveToolInput } from "./tools/drive";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import type { PermissionSubject } from "@/lib/auth/permissions";
import type {
  AssistantIntentId,
  AssistantPlan,
  AssistantPlanStep,
  ToolContext,
  ToolResult,
} from "./types";

export type AssistantTurnInput = {
  text: string;
  attachments?: string[];
  user: PermissionSubject & { id: string; role: Role };
  chatId?: string | null;
  nativeTurnId?: string;
  now?: Date;
  scope?: ToolContext["scope"];
  history?: ToolContext["history"];
  context?: string;
  validatedReferences?: ToolContext["validatedReferences"];
  signal?: AbortSignal;
  expectedDestination?: ToolContext["expectedDestination"];
  authorizeContext?: () => Promise<void>;
  planId?: string;
};

export type AssistantStreamEvent =
  | { type: "status"; message: string }
  | { type: "clarify"; message: string }
  | { type: "plan"; plan: AssistantPlan }
  | { type: "result"; toolId: AssistantIntentId; result: ToolResult }
  | { type: "done" }
  | { type: "error"; message: string };

export type AssistantTurnResult = {
  planId: string | null;
  clarify?: string;
  previewSteps: AssistantPlanStep[];
  streamEvents: AssistantStreamEvent[];
  /** Resultados de los pasos de lectura ya ejecutados (needsConfirm=false). */
  autoResults?: Array<{ toolId: AssistantIntentId; result: ToolResult }>;
  /** Metadatos de clasificación, para auditoría (`assistant.turn`). */
  classification: {
    source: "llm" | "rule";
    toolIds: string[];
    /** Prompt de clasificación; solo se persiste en auditoría si `auditLlmPrompts=true`. */
    prompt: string;
  };
};

async function resolveCausaId(normalized: {
  rit?: string;
  ruc?: string;
}, user: PermissionSubject & { id: string }): Promise<string | undefined> {
  if (!normalized.rit && !normalized.ruc) return undefined;
  const or = [
    normalized.rit ? { rit: normalized.rit } : null,
    normalized.ruc ? { ruc: normalized.ruc } : null,
  ].filter((v): v is { rit: string } | { ruc: string } => v !== null);
  if (or.length === 0) return undefined;
  const causa = await prisma.causa.findFirst({
    where: { AND: [causaAccessWhere(user), { OR: or }] },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return causa?.id;
}

/** Traduce slots libres del clasificador al input tipado de cada herramienta. */
function buildToolInput(
  toolId: AssistantIntentId,
  slots: Record<string, unknown>,
  resolved: { causaId?: string }
): Record<string, unknown> {
  const texto = typeof slots.texto === "string" ? slots.texto : "";
  const fecha = typeof slots.fecha === "string" ? slots.fecha : undefined;
  const causaId = (slots.causaId as string | undefined) || resolved.causaId;

  switch (toolId) {
    case "drive.estado": return {};
    case "drive.crearCarpeta": return { nombre: slots.nombre };
    case "drive.guardarDocumento": return { documentoId: slots.documentoId, documento: slots.documento };
    case "academia.listar": return {};
    case "academia.crear": return { titulo: slots.titulo, tipo: slots.tipo || "research" };
    case "academia.preparar": return { trabajoId: slots.trabajoId, mode: slots.mode || "synthesis", instruction: slots.instruction || texto };
    case "audiencia.listar": case "escrito.listar": return {};
    case "biblioteca.listar": case "sincronizacion.estado": return {};
    case "audiencia.crear": return { titulo: slots.titulo, fecha: slots.fechaISO || null };
    case "audiencia.nota": return { workspaceId: slots.workspaceId, titulo: slots.titulo || "Nota de audiencia", texto: slots.contenido || texto };
    case "escrito.guardar": return { titulo: slots.titulo };
    case "escritorio.listar":
      return {};
    case "escritorio.encargar":
      return { sessionId: slots.sessionId, texto };
    case "nota.crear":
      return {
        causaId,
        contenido: slots.contenido ?? texto,
        titulo: slots.titulo ?? "Nota",
        tags: slots.tags,
      };
    case "nota.editar":
      return {
        notaId: slots.notaId,
        titulo: slots.titulo,
        contenido: slots.contenido,
        tags: slots.tags,
      };
    case "tarea.crear":
      return {
        title: slots.title ?? texto.slice(0, 200),
        description: slots.description,
        priority: slots.priority,
        dueDate: slots.dueDate ?? fecha,
        causaId,
        siteId: slots.siteId,
        assigneeId: slots.assigneeId,
      };
    case "tarea.completar":
      return { taskId: slots.taskId };
    case "causa.vincular":
      return { causaId, clienteId: slots.clienteId, abogadoId: slots.abogadoId };
    case "causa.buscar":
      return { q: slots.q ?? texto };
    case "causa.resumen":
    case "causa.movimientos":
    case "causa.estado":
      return { causaId };
    case "minuta.borrador":
    case "minuta.crear":
      return {
        causaId,
        titulo: slots.titulo ?? texto.slice(0, 120) ?? "Minuta",
        resumenEjecutivo: slots.resumenEjecutivo ?? texto,
      };
    case "documento.buscar":
      return { q: slots.q ?? texto, causaId };
    case "documento.descargar":
    case "documento.resumir":
    case "documento.clasificar":
      return { documentoId: slots.documentoId };
    case "plazo.crear":
      return {
        titulo: slots.titulo ?? texto.slice(0, 120) ?? "Plazo",
        causaId,
        fechaLimite: slots.fechaLimite ?? fecha,
        diasPlazo: slots.diasPlazo,
        tipoComputo: slots.tipoComputo,
        esFatal: slots.esFatal,
      };
    case "plazo.estimar":
      return {
        desde: slots.desde ?? fecha,
        dias: slots.dias ?? 5,
        tipoComputo: slots.tipoComputo,
      };
    case "evento.crear": {
      const fechaBase =
        typeof slots.inicio === "string"
          ? slots.inicio
          : typeof fecha === "string"
            ? fecha
            : undefined;
      const time =
        typeof slots.time === "string"
          ? slots.time
          : typeof slots.hora === "string"
            ? slots.hora
            : undefined;
      const inicio =
        fechaBase && time && /^\d{4}-\d{2}-\d{2}$/.test(fechaBase)
          ? `${fechaBase}T${time}`
          : fechaBase;
      return {
        titulo: slots.titulo ?? texto.slice(0, 120) ?? "Evento",
        inicio,
        tipo: slots.tipo || (/\baudiencia\b/i.test(texto) ? "audiencia" : undefined),
        causaId,
        todoElDia: !time,
      };
    }
    case "evento.editar":
      return { eventoId: slots.eventoId, inicio: slots.inicio ?? fecha, titulo: slots.titulo };
    case "evento.eliminar":
      return { eventoId: slots.eventoId };
    case "buscar":
      return { q: slots.q ?? texto };
    case "jurisprudencia.buscar":
      return { q: slots.q ?? texto, materia: slots.materia };
    case "jurisprudencia.brief":
      return { jurisprudenciaId: slots.jurisprudenciaId };
    case "respuesta.libre":
    default:
      return { texto };
  }
}

/** Ejecuta pasos ya confirmados/auto-aprobados (reads). Nunca lanza: agrega error por paso. */
export async function executePlanSteps(
  steps: AssistantPlanStep[],
  ctx: ToolContext
): Promise<Array<{ toolId: AssistantIntentId; result: ToolResult }>> {
  const results: Array<{ toolId: AssistantIntentId; result: ToolResult }> = [];
  for (const [index, step] of steps.entries()) {
    ctx.signal?.throwIfAborted();
    await ctx.authorizeContext?.();
    const tool = getTool(step.toolId);
    try {
      const result = await tool.execute(step.input, { ...ctx, commandKey: ctx.commandKey ? `${ctx.commandKey}:${index}` : undefined });
      results.push({ toolId: step.toolId, result });
      if (!result.ok) break;
    } catch (e) {
      results.push({
        toolId: step.toolId,
        result: {
          ok: false,
          message: e instanceof Error && Number((e as { status?: number }).status) < 500
            ? e.message
            : "No se pudo completar este paso. Sus cambios no se guardaron; puede reintentar el mismo plan.",
        },
      });
      break;
    }
  }
  return results;
}

/**
 * Ejecuta un turno completo del asistente. No auto-ejecuta escrituras
 * (`needsConfirm=true`); solo construye y persiste el plan para confirmar
 * en `/api/assistant/confirm`. Los pasos de solo lectura se auto-ejecutan.
 */
export async function runAssistantTurn(
  input: AssistantTurnInput
): Promise<AssistantTurnResult> {
  input.signal?.throwIfAborted();
  await input.authorizeContext?.();
  const streamEvents: AssistantStreamEvent[] = [];
  streamEvents.push({ type: "status", message: "Analizando su solicitud…" });

  const normalized = normalizeAssistantInput(input.text, input.now, await getWorkCountry());
  const policy = await getAssistantFirmPolicy();
  const classification = await classifyIntents(normalized, {
    userId: input.user.id,
    attachments: input.scope ? undefined : input.attachments,
    assistantLlmMode: policy.assistantLlmMode,
    signal: input.signal,
    expectedDestination: input.expectedDestination,
    altazorContext: Boolean(input.chatId && input.scope && Object.prototype.hasOwnProperty.call(input.scope, "causaId")),
  });
  const classificationMeta = {
    source: classification.source,
    toolIds: classification.intents.map((i) => i.toolId),
    prompt: classification.prompt,
  };

  if (classification.clarify) {
    streamEvents.push({ type: "clarify", message: classification.clarify });
    return {
      planId: null,
      clarify: classification.clarify,
      previewSteps: [],
      streamEvents,
      classification: classificationMeta,
    };
  }

  input.signal?.throwIfAborted();
  const resolved = { causaId: input.scope ? input.scope.causaId || undefined : await resolveCausaId(normalized, input.user) };
  const ctx: ToolContext = {
    userId: input.user.id,
    role: input.user.role,
    capabilityGrants: input.user.capabilityGrants,
    capabilityRevokes: input.user.capabilityRevokes,
    chatId: input.chatId,
    nativeTurnId: input.nativeTurnId,
    scope: input.scope, history: input.history, context: input.context, validatedReferences: input.validatedReferences,
    signal: input.signal, expectedDestination: input.expectedDestination, authorizeContext: input.authorizeContext,
  };

  const steps: AssistantPlanStep[] = [];
  for (const classified of classification.intents) {
    input.signal?.throwIfAborted();
    // Selected attachments/passages have their own identity and provenance;
    // they are not Documento IDs. Route read-only analysis through the pinned
    // conversational tool without altering any accompanying write intent.
    const redirected = Boolean(input.scope && input.context?.trim() && ["documento.resumir", "documento.clasificar", "jurisprudencia.brief"].includes(classified.toolId));
    const intent: (typeof classification.intents)[number] = redirected ? { ...classified, toolId: "respuesta.libre", slots: { texto: input.text } } : classified;
    if (redirected && steps.some(step => step.toolId === "respuesta.libre")) continue;
    const tool = getTool(intent.toolId);
    if (!tool.roles.includes(input.user.role)) continue;
    if (input.scope && typeof intent.slots.causaId === "string" && intent.slots.causaId !== input.scope.causaId) throw new Error("La acción apunta a una causa distinta de esta conversación");
    let toolInput = buildToolInput(intent.toolId, input.scope ? { ...intent.slots, causaId: input.scope.causaId || undefined, ...(intent.toolId === "respuesta.libre" ? { texto: input.text } : {}) } : intent.slots, resolved);
    if (intent.toolId === "escritorio.encargar") toolInput = await resolveDesktopTaskInput(toolInput, ctx);
    const academic = intent.toolId.startsWith("academia."), workflow = intent.toolId.startsWith("audiencia.") || intent.toolId.startsWith("escrito.");
    try {
      if (intent.toolId.startsWith("drive.")) toolInput = await resolveDriveToolInput(intent.toolId, toolInput, ctx);
      if (academic) toolInput = await resolveAcademicToolInput(intent.toolId, toolInput, ctx);
      if (workflow) toolInput = await resolveWorkflowToolInput(intent.toolId, toolInput, ctx);
      if (intent.toolId === "biblioteca.listar" || intent.toolId === "sincronizacion.estado") toolInput = await resolveLibrarySyncInput(intent.toolId,toolInput,ctx);
    } catch (error) {
      if (!(error instanceof Error) || ![403,404,409].includes(Number((error as {status?:number}).status))) throw error;
      streamEvents.push({type:"clarify",message:error.message});
      return {planId:null,clarify:error.message,previewSteps:[],streamEvents,classification:classificationMeta};
    }
    const parsed = tool.inputSchema.safeParse(toolInput);
    if (!parsed.success) {
      streamEvents.push({
        type: "status",
        message: `No se pudo preparar "${intent.toolId}": ${parsed.error.issues
          .map((e) => e.message)
          .join("; ")}`,
      });
      continue;
    }
    const preview = await tool.preview(parsed.data, ctx);
    steps.push({
      toolId: intent.toolId,
      input: parsed.data as Record<string, unknown>,
      preview,
    });
  }

  if (steps.length === 0) {
    const message =
      "No pude preparar ninguna acción ejecutable con los datos disponibles. ¿Puede dar más detalle?";
    streamEvents.push({ type: "error", message });
    return { planId: null, previewSteps: [], streamEvents, classification: classificationMeta };
  }

  const needsConfirm = steps.some((s) => getTool(s.toolId).kind === "write");
  const plan: AssistantPlan = {
    id: input.planId || randomUUID(),
    intents: classification.intents,
    steps,
    needsConfirm,
  };
  await storePlan(plan, input.user.id);
  streamEvents.push({ type: "plan", plan });

  let autoResults: Array<{ toolId: AssistantIntentId; result: ToolResult }> | undefined;
  if (!needsConfirm) {
    autoResults = await executePlanSteps(steps, ctx);
    for (const r of autoResults) {
      streamEvents.push({ type: "result", toolId: r.toolId, result: r.result });
    }
  }

  streamEvents.push({ type: "done" });
  return {
    planId: plan.id,
    previewSteps: steps,
    streamEvents,
    autoResults,
    classification: classificationMeta,
  };
}
