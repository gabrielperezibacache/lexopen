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
  user: { id: string; role: Role };
  chatId?: string | null;
  now?: Date;
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
}): Promise<string | undefined> {
  if (!normalized.rit && !normalized.ruc) return undefined;
  const or = [
    normalized.rit ? { rit: normalized.rit } : null,
    normalized.ruc ? { ruc: normalized.ruc } : null,
  ].filter((v): v is { rit: string } | { ruc: string } => v !== null);
  if (or.length === 0) return undefined;
  const causa = await prisma.causa.findFirst({
    where: { OR: or },
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
  for (const step of steps) {
    const tool = getTool(step.toolId);
    try {
      const result = await tool.execute(step.input, ctx);
      results.push({ toolId: step.toolId, result });
    } catch (e) {
      results.push({
        toolId: step.toolId,
        result: {
          ok: false,
          message: e instanceof Error ? e.message : "Error al ejecutar la acción.",
        },
      });
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
  const streamEvents: AssistantStreamEvent[] = [];
  streamEvents.push({ type: "status", message: "Analizando su solicitud…" });

  const normalized = normalizeAssistantInput(input.text, input.now);
  const policy = await getAssistantFirmPolicy();
  const classification = await classifyIntents(normalized, {
    userId: input.user.id,
    attachments: input.attachments,
    assistantLlmMode: policy.assistantLlmMode,
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

  const resolved = { causaId: await resolveCausaId(normalized) };
  const ctx: ToolContext = {
    userId: input.user.id,
    role: input.user.role,
    chatId: input.chatId,
  };

  const steps: AssistantPlanStep[] = [];
  for (const intent of classification.intents) {
    const tool = getTool(intent.toolId);
    if (!tool.roles.includes(input.user.role)) continue;
    const toolInput = buildToolInput(intent.toolId, intent.slots, resolved);
    const parsed = tool.inputSchema.safeParse(toolInput);
    if (!parsed.success) {
      streamEvents.push({
        type: "status",
        message: `No se pudo preparar "${intent.toolId}": ${parsed.error.errors
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
    id: randomUUID(),
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
