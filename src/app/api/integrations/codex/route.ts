import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { assertPersonalCodexAction, canUsePersonalCodex, personalCodexPreference, savePersonalCodexPreference } from "@/lib/integrations/codex-preference";
import type { PermissionSubject } from "@/lib/auth/permissions";
import { beginCodexLogin, cancelCodexLogin, codexModels, codexStatus, completeWithCodex, disconnectCodex } from "@/lib/integrations/codex-session";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("models") }).strict(),
  z.object({ action: z.literal("save"), enabled: z.boolean(), model: z.string().max(200) }).strict(),
  z.object({ action: z.literal("test"), model: z.string().min(1).max(200) }).strict(),
]);
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
async function state(actor: PermissionSubject & { id: string }) {
  const [connection, preference, policy] = await Promise.all([codexStatus(actor.id), personalCodexPreference(actor.id), getAssistantFirmPolicy()]);
  return { connection, preference, canUse: canUsePersonalCodex(actor), remoteAllowed: policy.assistantLlmMode !== "local_only" };
}
async function limited(actorId: string, mutation = false) {
  const result = await rateLimitAsync(`codex:${mutation ? "write" : "read"}:${actorId}`, mutation ? 15 : 60, 60_000);
  if (!result.ok) throw httpError("Hay demasiadas solicitudes de conexión. Espere un momento y vuelva a intentarlo.", 429);
}
async function allowedModel(actorId: string, model: string) {
  if (!(await codexModels(actorId)).some(item => item.id === model)) throw httpError("El modelo no figura en el catálogo actual de su conexión. Actualice los modelos y elija uno.", 400);
}
export async function GET() {
  try { const actor = await requireStaff(); await limited(actor.id); return NextResponse.json(await state(actor), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const actor = await requireStaff(); await limited(actor.id, true);
    const body = await parseKnowledgeBody(request, schema, 4096);
    const policy = await getAssistantFirmPolicy();
    assertPersonalCodexAction(actor, body.action, policy.assistantLlmMode === "local_only", body.action === "save" && body.enabled);
    if (body.action === "connect") await beginCodexLogin(actor.id);
    if (body.action === "cancel") await cancelCodexLogin(actor.id);
    if (body.action === "disconnect") { const current = await personalCodexPreference(actor.id); await savePersonalCodexPreference(actor.id, { ...current, enabled: false }); await disconnectCodex(actor.id); }
    if (body.action === "models") return NextResponse.json({ models: await codexModels(actor.id) }, { headers });
    if (body.action === "save") {
      if (body.enabled) await allowedModel(actor.id, body.model);
      if (body.enabled && !(await codexStatus(actor.id)).connected) throw httpError("Conecte su cuenta de Codex antes de activarla.", 409);
      await savePersonalCodexPreference(actor.id, { enabled: body.enabled, model: body.model });
    }
    if (body.action === "test") {
      await allowedModel(actor.id, body.model);
      const result = await completeWithCodex(actor.id, [{ role: "user", content: "Responde únicamente: Conexión de LexOpen comprobada." }], { model: body.model, timeoutMs: 30_000 });
      return NextResponse.json({ ok: true, preview: result.content.slice(0, 300), model: result.model }, { headers });
    }
    await prisma.auditEvent.create({ data: { actorId: actor.id, action: `codex.${body.action}`, entityType: "personal_codex", entityId: actor.id, afterJson: JSON.stringify(body.action === "save" ? { enabled: body.enabled, model: body.model } : {}) } });
    return NextResponse.json(await state(actor), { headers });
  } catch (error) { return failure(error); }
}
