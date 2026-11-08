import { prisma } from "@/lib/db";
import type { LlmMessage } from "@/lib/integrations/llm";
import { personalCodexPreference } from "./codex-preference";
import { completeWithCodex } from "./codex-session";
import { sha256 } from "@/lib/evidence/fragments";

/** Called after the common capability and message checks, before any egress. */
export async function askPersonalCodex(params: { userId?: string; causaId?: string; messages: LlmMessage[]; timeoutMs?: number; signal?: AbortSignal; modelOverride?: string; expectedDestination?: { provider: string; model: string; endpointHash: string } }, localOnly: boolean) {
  if (!params.userId) return null;
  const preference = await personalCodexPreference(params.userId);
  if (!preference.enabled) return null;
  const model = params.modelOverride ?? preference.model;
  const fail = (note: string, code: string) => ({ source: "error" as const, content: "", requireApproval: true, provider: "codex" as const, model, note, error: code, code });
  if (params.expectedDestination && (params.expectedDestination.provider !== "codex" || params.expectedDestination.model !== model || params.expectedDestination.endpointHash !== sha256("codex"))) return fail("El destino de IA cambió. Revise su conexión antes de volver a enviar.", "llm_destination_changed");
  if (localOnly) return fail("El estudio permite sólo IA local. Codex requiere enviar la solicitud a OpenAI; no se envió texto.", "llm_remote_forbidden");
  if (!model || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(model)) return fail("Seleccione un modelo válido en Mi cuenta → Codex antes de usar su conexión.", "codex_model_required");
  try {
    const result = await completeWithCodex(params.userId, params.messages, { model, signal: params.signal, timeoutMs: Math.min(params.timeoutMs || 45_000, 45_000) });
    if (params.causaId) await prisma.activity.create({ data: { tipo: "ia", mensaje: "Codex personal: solicitud completada para revisión del profesional.", causaId: params.causaId, userId: params.userId } });
    return { source: "llm" as const, content: result.content, requireApproval: true, provider: "codex" as const, model: result.model, note: "Respuesta de su conexión personal de Codex; requiere revisión profesional." };
  } catch {
    return fail("Codex no pudo completar la solicitud. Revise su conexión y el modelo en Mi cuenta → Codex; su texto se conserva.", "codex_request_failed");
  }
}
