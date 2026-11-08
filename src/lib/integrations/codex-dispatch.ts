import { prisma } from "@/lib/db";
import type { LlmMessage } from "@/lib/integrations/llm";
import { personalCodexPreference } from "./codex-preference";
import { codexDestinationFor } from "./codex-destination";
import { completeWithCodex, completeWithHostCodex } from "./codex-session";

/** Called after the common capability and message checks, before any egress. */
export async function askPersonalCodex(params: { userId?: string; causaId?: string; messages: LlmMessage[]; timeoutMs?: number; signal?: AbortSignal; expectedDestination?: { provider: string; model: string; endpointHash: string } }, localOnly: boolean) {
  if (!params.userId) return null;
  const preference = await personalCodexPreference(params.userId);
  if (!preference.enabled) return null;
  const destination = await codexDestinationFor(params.userId, preference);
  const host = preference.source === "host";
  const fail = (note: string, code: string) => ({ source: "error" as const, content: "", requireApproval: true, provider: "codex" as const, model: preference.model, note, error: code, code });
  if (params.expectedDestination && (params.expectedDestination.provider !== "codex" || params.expectedDestination.model !== preference.model || params.expectedDestination.endpointHash !== destination.endpointHash)) return fail("El destino de IA cambió. Revise su conexión antes de volver a enviar.", "llm_destination_changed");
  if (localOnly) return fail("El estudio permite sólo IA local. Codex requiere enviar la solicitud a OpenAI; no se envió texto.", "llm_remote_forbidden");
  if (!preference.model) return fail("Seleccione un modelo en Mi cuenta → Codex antes de usar su conexión.", "codex_model_required");
  if (!destination.permitted) return fail("El administrador deshabilitó Codex del Host. Elija una conexión disponible en Mi cuenta → Codex; su texto se conserva.", "codex_host_unavailable");
  try {
    const options = { model: preference.model, signal: params.signal, personalRevision: preference.revision, hostRevision: destination.hostRevision, timeoutMs: Math.min(params.timeoutMs || 45_000, 45_000) };
    const result = host ? await completeWithHostCodex(params.messages, options) : await completeWithCodex(params.userId, params.messages, options);
    if (params.causaId) await prisma.activity.create({ data: { tipo: "ia", mensaje: `${host ? "Codex del Host" : "Codex personal"}: solicitud completada para revisión del profesional.`, causaId: params.causaId, userId: params.userId } });
    return { source: "llm" as const, content: result.content, requireApproval: true, provider: "codex" as const, model: result.model, note: host ? "Respuesta de Codex del Host; requiere revisión profesional." : "Respuesta de su conexión personal de Codex; requiere revisión profesional." };
  } catch {
    return fail("Codex no pudo completar la solicitud. Revise su conexión y el modelo en Mi cuenta → Codex; su texto se conserva.", "codex_request_failed");
  }
}
