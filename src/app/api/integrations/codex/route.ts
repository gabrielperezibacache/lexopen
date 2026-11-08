import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { assertPersonalCodexAction, canUsePersonalCodex, hostCodexPolicy, personalCodexPreference, rotatePersonalCodexRevision, savePersonalCodexPreference, type CodexSource } from "@/lib/integrations/codex-preference";
import type { PermissionSubject } from "@/lib/auth/permissions";
import { beginCodexLogin, cancelCodexLogin, codexModels, codexStatus, completeWithCodex, completeWithHostCodex, disconnectCodex, hostCodexModels, hostCodexStatus } from "@/lib/integrations/codex-session";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const personalRuntime = globalThis as typeof globalThis & { lexopenPersonalCodexMutations?: Set<string> };
const personalMutations = personalRuntime.lexopenPersonalCodexMutations ??= new Set<string>();
function assertPersonalIdle(actorId: string) {
  if (personalMutations.has(actorId)) throw httpError("Su conexión de Codex está cambiando. Espere un momento y vuelva a intentarlo.", 409);
}
function acquirePersonalMutation(actorId: string) {
  assertPersonalIdle(actorId);
  personalMutations.add(actorId);
  return () => { personalMutations.delete(actorId); };
}
const source = z.enum(["personal", "host"]).default("personal");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("models"), source }).strict(),
  z.object({ action: z.literal("save"), enabled: z.boolean(), model: z.string().max(200), source }).strict(),
  z.object({ action: z.literal("test"), model: z.string().min(1).max(200), source }).strict(),
]);
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
async function state(actor: PermissionSubject & { id: string }) {
  const [connection, preference, policy, sharing] = await Promise.all([codexStatus(actor.id), personalCodexPreference(actor.id), getAssistantFirmPolicy(), hostCodexPolicy()]);
  const host = sharing.enabled ? await hostCodexStatus() : { available: false, connected: false };
  // Host account details and device codes are available only to Host administrators.
  return { connection, preference, canUse: canUsePersonalCodex(actor), remoteAllowed: policy.assistantLlmMode !== "local_only", host: { enabled: sharing.enabled, available: host.available, connected: host.connected } };
}
async function limited(actorId: string, mutation = false) {
  const result = await rateLimitAsync(`codex:${mutation ? "write" : "read"}:${actorId}`, mutation ? 15 : 60, 60_000);
  if (!result.ok) throw httpError("Hay demasiadas solicitudes de conexión. Espere un momento y vuelva a intentarlo.", 429);
}
async function modelsFor(actorId: string, selectedSource: CodexSource) {
  if (selectedSource === "host") {
    const sharing = await hostCodexPolicy();
    if (!sharing.enabled) throw httpError("El administrador no ha habilitado Codex del Host.", 403);
    if (!(await hostCodexStatus()).connected) throw httpError("Codex del Host no está conectado. Contacte con el administrador.", 409);
    return { models: await hostCodexModels(), hostRevision: sharing.revision };
  }
  if (!(await codexStatus(actorId)).connected) throw httpError("Conecte su cuenta de Codex antes de activarla.", 409);
  return { models: await codexModels(actorId), hostRevision: undefined };
}
async function allowedModel(actorId: string, selectedSource: CodexSource, model: string) {
  const catalog = await modelsFor(actorId, selectedSource);
  if (!catalog.models.some(item => item.id === model)) throw httpError("El modelo no figura en el catálogo actual de la conexión seleccionada. Actualice los modelos y elija uno.", 400);
  return catalog.hostRevision;
}
export async function GET() {
  try { const actor = await requireStaff(); await limited(actor.id); return NextResponse.json(await state(actor), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  let releaseMutation = () => {};
  try {
    assertCsrf(request);
    const actor = await requireStaff(); await limited(actor.id, true);
    const body = await parseKnowledgeBody(request, schema, 4096);
    const policy = await getAssistantFirmPolicy();
    assertPersonalCodexAction(actor, body.action, policy.assistantLlmMode === "local_only", body.action === "save" && body.enabled);
    if (body.action === "models" || body.action === "test") assertPersonalIdle(actor.id);
    else releaseMutation = acquirePersonalMutation(actor.id);
    if (body.action === "connect") {
      const current = await personalCodexPreference(actor.id);
      if (current.source === "personal" && current.enabled) await savePersonalCodexPreference(actor.id, { enabled: false, model: current.model, source: current.source });
      else await rotatePersonalCodexRevision(actor.id);
      await beginCodexLogin(actor.id);
    }
    if (body.action === "cancel") {
      await rotatePersonalCodexRevision(actor.id);
      await cancelCodexLogin(actor.id);
    }
    if (body.action === "disconnect") {
      const current = await personalCodexPreference(actor.id);
      if (current.source === "personal") await savePersonalCodexPreference(actor.id, { enabled: false, model: current.model, source: current.source });
      else await rotatePersonalCodexRevision(actor.id);
      await disconnectCodex(actor.id);
    }
    if (body.action === "models") return NextResponse.json({ models: (await modelsFor(actor.id, body.source)).models }, { headers });
    if (body.action === "save") {
      if (body.enabled) await allowedModel(actor.id, body.source, body.model);
      await savePersonalCodexPreference(actor.id, { enabled: body.enabled, model: body.model, source: body.source });
    }
    if (body.action === "test") {
      const hostRevision = await allowedModel(actor.id, body.source, body.model);
      const messages = [{ role: "user" as const, content: "Responde únicamente: Conexión de LexOpen comprobada." }];
      const options = { model: body.model, timeoutMs: 30_000, signal: request.signal, hostRevision };
      const result = body.source === "host" ? await completeWithHostCodex(messages, options) : await completeWithCodex(actor.id, messages, options);
      return NextResponse.json({ ok: true, preview: result.content.slice(0, 300), model: result.model }, { headers });
    }
    await prisma.auditEvent.create({ data: { actorId: actor.id, action: `codex.${body.action}`, entityType: "personal_codex", entityId: actor.id, afterJson: JSON.stringify(body.action === "save" ? { enabled: body.enabled, model: body.model, source: body.source } : {}) } });
    return NextResponse.json(await state(actor), { headers });
  } catch (error) { return failure(error); }
  finally { releaseMutation(); }
}
