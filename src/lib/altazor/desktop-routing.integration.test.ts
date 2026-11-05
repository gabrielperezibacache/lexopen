/** Real native executor + owned disposable PG; only the provider transport is fictitious. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { altazorDestination, createAltazorConversation, createAltazorTurn, executeAltazorTurn, readAltazorConversation } from "./conversations";
import { classifyIntents } from "@/lib/assistant/classify";
import { normalizeAssistantInput } from "@/lib/assistant/normalize";
import { assertToolInputAccess } from "@/lib/assistant/secure-tool";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [], cases: string[] = [], workspaces: string[] = [], conversations: string[] = [], plans: string[] = [];
  const originalFetch = globalThis.fetch, beforeLlm = await prisma.integrationConfig.findUnique({ where: { provider: "llm" } });
  const beforePolicy = await prisma.firmSettings.findFirst({ select: { id: true, assistantLlmMode: true } });
  let organizationId: string | undefined, requests = 0;
  const text = "Solo muéstrame los escritorios de ALTAZOR de este espacio.";
  globalThis.fetch = (async (raw, init) => {
    assert.equal(String(raw), "http://127.0.0.1:18850/v1/chat/completions");
    assert.equal(init?.method, "POST"); requests++;
    // A valid but mistaken small-model classification reproduces the real fault.
    return Response.json({ choices: [{ message: { content: JSON.stringify({ intents: [{ toolId: "buscar", confidence: 1, slots: { q: text } }] }) } }] });
  }) as typeof fetch;
  try {
    const config = { preset: "custom", apiUrl: "http://127.0.0.1:18850/v1", model: "fictitious-misrouter", apiKey: "", requireApproval: true, allowDemo: false };
    await prisma.integrationConfig.upsert({ where: { provider: "llm" }, create: { provider: "llm", enabled: true, configJson: JSON.stringify(config) }, update: { enabled: true, configJson: JSON.stringify(config) } });
    if (beforePolicy) await prisma.firmSettings.update({ where: { id: beforePolicy.id }, data: { assistantLlmMode: "remote_allowed" } });
    else { const organization = await prisma.organization.create({ data: { name: "Native desktop routing fixture", settings: { create: { assistantLlmMode: "remote_allowed" } } } }); organizationId = organization.id; }
    const owner = await prisma.user.create({ data: { email: `${tag}@native-desktop.invalid`, name: "Native desktop fixture owner", role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@native-desktop.invalid`, name: "Native desktop fixture outsider", role: "abogado", password: "not-a-login" } }); users.push(other.id);
    const causa = await prisma.causa.create({ data: { titulo: "Native desktop routing fixture", materia: "civil", tribunal: "Fictitious", acceso: "equipo", abogadoId: owner.id } }); cases.push(causa.id);
    let activeId = "";
    for (const [index, scope] of [{ ownerId: owner.id, causaId: null }, { ownerId: owner.id, causaId: causa.id }, { ownerId: other.id, causaId: null }].entries()) {
      const workspace = await prisma.altazorComputerWorkspace.create({ data: { ownerId: scope.ownerId, causaId: scope.causaId, scopeKey: scope.causaId ? `causa:${scope.causaId}` : "personal", endpoint: `http://127.0.0.1:${18851 + index}`, providerName: "Fictitious desktop provider", credentialEnc: "fictitious-read-only-unused-credential", enabled: true, dedicatedDeclaredAt: new Date() } }); workspaces.push(workspace.id);
      const session = await prisma.altazorComputerSession.create({ data: { ownerId: scope.ownerId, workspaceId: workspace.id, requestId: `session-${tag}-${index}`, kittyId: `fixture-kitty-${index}`, chatId: `fixture-chat-${index}`, kittyName: `native-${tag}-${index}`, state: index === 0 ? "closed" : "ready", expiresAt: new Date(Date.now() + 60_000) } });
      if (index === 1) activeId = session.id;
    }
    const destination = await altazorDestination(owner.id);
    const misrouted = await classifyIntents(normalizeAssistantInput(text), { userId: owner.id, assistantLlmMode: "remote_allowed", expectedDestination: destination });
    assert.equal(misrouted.source, "llm"); assert.equal(misrouted.intents[0].toolId, "buscar"); assert.equal(requests, 1, "the configured provider really returns the erroneous source tool"); requests = 0;
    for (const causaId of [null, causa.id]) {
      const created = await createAltazorConversation({ requestId: `conversation-${tag}-${causaId || "personal"}`, title: "Native fixture desktop query", causaId }, owner); conversations.push(created.conversation.id);
      const queued = await createAltazorTurn(created.conversation.id, { requestId: `turn-${tag}-${causaId || "personal"}`, expectedRevision: created.conversation.revision, text, destinationKey: destination.key }, owner);
      // No options.execute or destination stub: use the complete production path.
      const result = await executeAltazorTurn(created.conversation.id, queued.turnId, owner);
      const turn = result.turns[0]; assert.equal(turn.status, "completed", `native ${causaId ? "case" : "personal"} query must complete`); assert.equal(turn.errorCode, null); assert.equal(turn.results[0].toolId, "escritorio.listar"); assert.equal(turn.results[0].result.ok, true);
      const card = turn.results[0].result.card; assert.equal(card.causaId, causaId); assert.equal(card.type, "escritorio");
      assert.deepEqual((card.sessions as { id: string }[]).map(session => session.id), causaId ? [activeId] : []);
      const row = await prisma.altazorTurn.findUniqueOrThrow({ where: { id: queued.turnId } }); assert.ok(row.planId); plans.push(row.planId);
      const plan = JSON.parse((await prisma.assistantPlanRecord.findUniqueOrThrow({ where: { id: row.planId } })).planJson);
      assert.equal(plan.needsConfirm, false); assert.deepEqual(plan.steps.map((step: { toolId: string; input: unknown }) => ({ toolId: step.toolId, input: step.input })), [{ toolId: "escritorio.listar", input: {} }]);
      assert.equal((await readAltazorConversation(created.conversation.id, owner)).turns[0].status, "completed");
    }
    assert.equal(requests, 0, "explicit native desktop reads expose no conversation/source bytes to a model or gateway");
    await assert.rejects(assertToolInputAccess("buscar", { q: text }, { userId: owner.id, role: "abogado", scope: { causaId: null }, chatId: conversations[0] }, false), error => Number((error as { status?: number }).status) === 409);
    await assert.rejects(readAltazorConversation(conversations[0], other), error => Number((error as { status?: number }).status) === 404);
    console.log("Native desktop routing PG PASS: default create/execute/read, personal closed-only and case active desktops, current owner/scope, mistaken real classifier transport bypassed for explicit reads, zero native model/gateway traffic, source guard unchanged. Fictitious only.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.altazorConversation.deleteMany({ where: { id: { in: conversations } } }); await prisma.assistantPlanRecord.deleteMany({ where: { OR: [{ id: { in: plans } }, { ownerId: { in: users } }] } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } }); await prisma.causa.deleteMany({ where: { id: { in: cases } } }); await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (beforeLlm) await prisma.integrationConfig.update({ where: { provider: "llm" }, data: { enabled: beforeLlm.enabled, configJson: beforeLlm.configJson } }); else await prisma.integrationConfig.deleteMany({ where: { provider: "llm" } });
    if (beforePolicy) await prisma.firmSettings.update({ where: { id: beforePolicy.id }, data: { assistantLlmMode: beforePolicy.assistantLlmMode } }); if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Native desktop routing fixture failed"); process.exitCode = 1; });
