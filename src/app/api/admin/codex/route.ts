import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hostCodexPolicy, saveHostCodexPolicy } from "@/lib/integrations/codex-preference";
import { beginHostCodexLogin, cancelHostCodexLogin, closeHostCodexSessions, completeWithHostCodex, disconnectHostCodex, hostCodexModels, hostCodexStatus } from "@/lib/integrations/codex-session";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const hostRuntime = globalThis as typeof globalThis & { lexopenHostCodexMutationBusy?: boolean };
function assertHostIdle() {
  if (hostRuntime.lexopenHostCodexMutationBusy) throw httpError("Codex del Host está cambiando su conexión. Espere un momento y vuelva a intentarlo.", 409);
}
function acquireHostMutation() {
  assertHostIdle();
  hostRuntime.lexopenHostCodexMutationBusy = true;
  return () => { hostRuntime.lexopenHostCodexMutationBusy = false; };
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("models") }).strict(),
  z.object({ action: z.literal("save"), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("test"), model: z.string().min(1).max(200) }).strict(),
]);

function failure(error: unknown) {
  const response = handleRouteError(error);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

async function state() {
  const [connectionHost, policy, firm] = await Promise.all([hostCodexStatus(), hostCodexPolicy(), getAssistantFirmPolicy()]);
  return { connectionHost, policy, remoteAllowed: firm.assistantLlmMode !== "local_only" };
}

async function limited(actorId: string, mutation = false) {
  const result = await rateLimitAsync(`codex:host:${mutation ? "write" : "read"}:${actorId}`, mutation ? 15 : 60, 60_000);
  if (!result.ok) throw httpError("Hay demasiadas solicitudes de conexión. Espere un momento y vuelva a intentarlo.", 429);
}

async function setSharing(actorId: string, enabled: boolean, reason: string, expectedRevision?: string) {
  // Persist revocation before account changes, even when the CLI operation fails.
  await prisma.$transaction(async (tx) => {
    await saveHostCodexPolicy(enabled, tx, expectedRevision);
    await tx.auditEvent.create({ data: { actorId, action: "codex.host.sharing", entityType: "host_codex", entityId: "host", afterJson: JSON.stringify({ enabled, reason }) } });
  });
  if (!enabled) await closeHostCodexSessions();
}

export async function GET() {
  try {
    const actor = await requireRole("admin");
    await limited(actor.id);
    return NextResponse.json(await state(), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  let releaseMutation = () => {};
  try {
    assertCsrf(request);
    const actor = await requireRole("admin");
    await limited(actor.id, true);
    const body = await parseKnowledgeBody(request, schema, 4096);
    // Account changes and sharing decisions must not interleave in this Host.
    // The persisted revision also rejects stale decisions from another worker.
    if (body.action === "models" || body.action === "test") assertHostIdle();
    else releaseMutation = acquireHostMutation();
    const firm = await getAssistantFirmPolicy();
    if (firm.assistantLlmMode === "local_only" && (body.action === "connect" || body.action === "models" || body.action === "test" || body.action === "save" && body.enabled)) throw httpError("El estudio permite sólo IA local. Codex del Host no puede usarse bajo esa política.", 403);
    if (body.action === "connect" || body.action === "disconnect") {
      await setSharing(actor.id, false, body.action);
      if (body.action === "connect") await beginHostCodexLogin();
      else await disconnectHostCodex();
    }
    if (body.action === "cancel") await cancelHostCodexLogin();
    if (body.action === "models") return NextResponse.json({ models: await hostCodexModels() }, { headers });
    if (body.action === "save") {
      // The connection check must authorize this exact policy revision. A
      // concurrent reconnect/disconnect invalidates it in the same DB boundary.
      const sharing = body.enabled ? await hostCodexPolicy() : undefined;
      if (body.enabled && !(await hostCodexStatus()).connected) throw httpError("Conecte la cuenta de Codex del Host antes de compartirla.", 409);
      await setSharing(actor.id, body.enabled, "save", sharing?.revision);
    }
    if (body.action === "test") {
      if (!(await hostCodexModels()).some(model => model.id === body.model)) throw httpError("El modelo no figura en el catálogo actual de Codex del Host. Actualice los modelos y elija uno.", 400);
      const result = await completeWithHostCodex([{ role: "user", content: "Responde únicamente: Conexión de LexOpen comprobada." }], { model: body.model, timeoutMs: 30_000, signal: request.signal });
      return NextResponse.json({ ok: true, preview: result.content.slice(0, 300), model: result.model }, { headers });
    }
    if (body.action !== "save") await prisma.auditEvent.create({ data: { actorId: actor.id, action: `codex.host.${body.action}`, entityType: "host_codex", entityId: "host", afterJson: "{}" } });
    return NextResponse.json(await state(), { headers });
  } catch (error) { return failure(error); }
  finally { releaseMutation(); }
}
