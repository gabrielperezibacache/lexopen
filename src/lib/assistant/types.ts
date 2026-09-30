/**
 * Tipos compartidos del motor de intención del asistente (`/inicio`).
 * No duplica lógica de dominio: solo tipa la orquestación (normalize →
 * classify → resolve → plan → confirm → execute) sobre `lib/plazos`,
 * `lib/search`, `lib/integrations/llm`, `lib/minutas`, etc.
 */

import type { Role } from "@/lib/auth/rbac";

/** IDs de herramienta reconocidos por el asistente (registry + clasificador). */
export const ASSISTANT_TOOL_IDS = [
  "nota.crear",
  "nota.editar",
  "tarea.crear",
  "tarea.completar",
  "causa.vincular",
  "causa.buscar",
  "causa.resumen",
  "causa.movimientos",
  "causa.estado",
  "minuta.borrador",
  "minuta.crear",
  "documento.buscar",
  "documento.descargar",
  "documento.resumir",
  "documento.clasificar",
  "plazo.crear",
  "plazo.estimar",
  "evento.crear",
  "evento.editar",
  "evento.eliminar",
  "buscar",
  "jurisprudencia.buscar",
  "jurisprudencia.brief",
  "respuesta.libre",
] as const;

export type AssistantIntentId = (typeof ASSISTANT_TOOL_IDS)[number];

export function isAssistantToolId(value: string): value is AssistantIntentId {
  return (ASSISTANT_TOOL_IDS as readonly string[]).includes(value);
}

/** Herramientas de lectura nunca requieren confirmación humana; escritura sí. */
export type ToolKind = "read" | "write";

export type ToolContext = {
  userId: string;
  role: Role;
  chatId?: string | null;
};

export type ToolResult = {
  ok: boolean;
  message: string;
  card?: Record<string, unknown> | null;
  undoToken?: string | null;
  entityId?: string | null;
};

export type AssistantIntent = {
  toolId: AssistantIntentId;
  confidence: number;
  slots: Record<string, unknown>;
};

export type AssistantPlanStep = {
  toolId: AssistantIntentId;
  input: Record<string, unknown>;
  preview: string;
};

export type AssistantPlan = {
  id: string;
  intents: AssistantIntent[];
  steps: AssistantPlanStep[];
  needsConfirm: boolean;
};
