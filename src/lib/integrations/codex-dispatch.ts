import { prisma } from "@/lib/db";
import type { LlmMessage } from "@/lib/integrations/llm";
import { personalCodexPreference } from "./codex-preference";
import { completeWithCodex } from "./codex-session";

/** Called after the common capability and message checks, before any egress. */
export async function askPersonalCodex(params: { userId?: string; causaId?: string; messages: LlmMessage[]; timeoutMs?: number }, localOnly: boolean) {
  if (!params.userId) return null;
  const preference = await personalCodexPreference(params.userId);
  if (!preference.enabled) return null;
  const fail = (note: string, code: string) => ({ source: "error" as const, content: "", requireApproval: true, provider: "codex" as const, model: preference.model, note, error: code, code });
  if (localOnly) return fail("El estudio permite sólo IA local. Codex requiere enviar la solicitud a OpenAI; no se envió texto.", "llm_remote_forbidden");
  if (!preference.model) return fail("Seleccione un modelo en Mi cuenta → Codex antes de usar su conexión.", "codex_model_required");
  try {
    const result = await completeWithCodex(params.userId, params.messages, { model: preference.model, timeoutMs: Math.min(params.timeoutMs || 45_000, 45_000) });
    if (params.causaId) await prisma.activity.create({ data: { tipo: "ia", mensaje: "Codex personal: solicitud completada para revisión del profesional.", causaId: params.causaId, userId: params.userId } });
    return { source: "llm" as const, content: result.content, requireApproval: true, provider: "codex" as const, model: result.model, note: "Respuesta de su conexión personal de Codex; requiere revisión profesional." };
  } catch {
    return fail("Codex no pudo completar la solicitud. Revise su conexión y el modelo en Mi cuenta → Codex; su texto se conserva.", "codex_request_failed");
  }
}
