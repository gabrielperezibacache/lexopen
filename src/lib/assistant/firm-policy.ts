/**
 * Política del asistente a nivel de estudio (`FirmSettings.assistantLlmMode` /
 * `auditLlmPrompts`). Se lee de la primera `Organization` (mismo patrón que
 * `hermesAllowDemo` en `lib/integrations/llm`). Nunca lanza: si no hay fila,
 * aplica los valores por defecto (más restrictivos para privacidad).
 */

import { prisma } from "@/lib/db";

export type AssistantLlmMode = "local_only" | "remote_allowed";

export type AssistantFirmPolicy = {
  assistantLlmMode: AssistantLlmMode;
  auditLlmPrompts: boolean;
};

export const DEFAULT_ASSISTANT_FIRM_POLICY: AssistantFirmPolicy = {
  assistantLlmMode: "remote_allowed",
  auditLlmPrompts: false,
};

export function isAssistantLlmMode(value: unknown): value is AssistantLlmMode {
  return value === "local_only" || value === "remote_allowed";
}

/** Aplica los defaults sobre una fila (parcial/nula) de `FirmSettings`. */
export function normalizeAssistantFirmPolicy(
  row?: { assistantLlmMode?: string | null; auditLlmPrompts?: boolean | null } | null
): AssistantFirmPolicy {
  return {
    assistantLlmMode: isAssistantLlmMode(row?.assistantLlmMode)
      ? row.assistantLlmMode
      : DEFAULT_ASSISTANT_FIRM_POLICY.assistantLlmMode,
    auditLlmPrompts: Boolean(
      row?.auditLlmPrompts ?? DEFAULT_ASSISTANT_FIRM_POLICY.auditLlmPrompts
    ),
  };
}

export async function getAssistantFirmPolicy(): Promise<AssistantFirmPolicy> {
  const firm = await prisma.firmSettings.findFirst({
    select: { assistantLlmMode: true, auditLlmPrompts: true },
  });
  return normalizeAssistantFirmPolicy(firm);
}
