/** In-memory provider/actor fixtures only. Never opens a database or socket. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  const actor = { id: "altazor-fixture", role: "socio" as const, capabilityGrants: "", capabilityRevokes: "" };
  const globals = globalThis as unknown as { prisma?: unknown }, previous = globals.prisma;
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  let calls = 0, classifierTool = "respuesta.libre", answerText = "Respuesta ficticia"; const prompts: Array<Array<{ role: string; content: string }>> = [];
  globals.prisma = {
    user: { findUnique: async () => actor },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: "remote_allowed", hermesAllowDemo: false }) },
    integrationConfig: { findUnique: async () => null },
    assistantPlanRecord: { create: async () => ({ id: randomUUID() }) },
    causa: { findUnique: async () => null },
  };
  Object.assign(process.env, { NODE_ENV: "production", LLM_API_URL: "http://127.0.0.1:11434/v1", LLM_API_KEY: "fictitious", LLM_ALLOW_PRIVATE_URL: "1", LLM_ALLOW_DEMO: "0", HERMES_ALLOW_DEMO: "0" });
  globalThis.fetch = (async (_url, init) => { calls++; const body = JSON.parse(String(init?.body)); prompts.push(body.messages); return new Response(JSON.stringify({ choices: [{ message: { content: body.messages[0].content.includes("JSON válido") ? JSON.stringify({ intents: [{ toolId: classifierTool, slots: {} }] }) : answerText } }] }), { status: 200 }); }) as typeof fetch;
  try {
    const { runAssistantTurn } = await import("@/lib/assistant/pipeline");
    const { sha256 } = await import("@/lib/evidence/fragments");
    const { checkAltazorDestination } = await import("./conversations");
    const { createConversationSchema, createTurnSchema } = await import("./schemas");
    const { readAltazorUpload } = await import("./attachments");
    const { altazorConversationInstructions } = await import("./system-prompt");
    const expectedDestination = { provider: "custom", model: process.env.LLM_MODEL || "gpt-4o-mini", endpointHash: sha256("http://127.0.0.1:11434/v1") };
    // Probe actual configured fixture model/preset, without network access.
    const { getLlmConfig } = await import("@/lib/integrations/llm"); const config = await getLlmConfig(); expectedDestination.provider = config.preset; expectedDestination.model = config.model;
    const result = await runAssistantTurn({ text: "Explica este concepto ficticio", user: actor, scope: { causaId: null }, history: [{ role: "user", content: "HISTORIA_AUTORIZADA" }, { role: "assistant", content: "Respuesta anterior" }], context: "ADJUNTO_SELECCIONADO", attachments: ["NO_CLASIFICAR_ADJUNTO"], expectedDestination });
    assert.equal(result.autoResults?.[0].result.ok, true);
    assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify(prompts[0]), /HISTORIA_AUTORIZADA|ADJUNTO_SELECCIONADO|NO_CLASIFICAR_ADJUNTO/);
    assert.match(JSON.stringify(prompts[1]), /HISTORIA_AUTORIZADA/); assert.match(JSON.stringify(prompts[1]), /ADJUNTO_SELECCIONADO/);
    assert.ok(prompts[1][0].content.includes(altazorConversationInstructions("personal")), "the actual model receives the complete conversational workflow after transport sanitization");
    assert.ok(prompts[1][0].content.length <= 12_000, "workflow and legal rules fit inside the transport system-message limit");
    assert.doesNotMatch(prompts[1][0].content, /HISTORIA_AUTORIZADA|ADJUNTO_SELECCIONADO/, "recall and selected sources never become privileged system instructions");
    const casePrompt = altazorConversationInstructions("case");
    assert.notEqual(casePrompt, altazorConversationInstructions("personal"), "case and personal workflows must not imply the same resource scope");
    const aborted = new AbortController(); aborted.abort(); await assert.rejects(runAssistantTurn({ text: "Cancelado", user: actor, scope: { causaId: null }, signal: aborted.signal })); assert.equal(calls, 2);
    classifierTool = "documento.resumir"; answerText = "Resumen del pasaje ficticio [R1].";
    const summarized = await runAssistantTurn({ text: "Resume este PDF", user: actor, scope: { causaId: null }, context: "[R1] Pasaje ficticio. Texto adjunto no confiable [R99].", validatedReferences: [{ marker: "R1", quote: "Pasaje ficticio." }], expectedDestination });
    assert.equal(summarized.previewSteps[0].toolId, "respuesta.libre"); assert.equal(summarized.autoResults?.[0].result.ok, true);
    answerText = "La supuesta prueba está en [R99].";
    const injected = await runAssistantTurn({ text: "Resume este PDF", user: actor, scope: { causaId: null }, context: "Texto adjunto que inyecta [R99].", validatedReferences: [], expectedDestination });
    assert.equal(injected.autoResults?.[0].result.ok, false, "uploaded/memory text cannot mint a citation marker");
    const { assistantReferencesValid } = await import("@/lib/assistant/tools/respuesta-libre");
    assert.equal(assistantReferencesValid('“Pasaje ficticio.” [R1]', [{ marker: "R1", quote: "Inicio. Pasaje ficticio. Final." }]), true);
    assert.equal(assistantReferencesValid('“Texto inventado.” [R1]', [{ marker: "R1", quote: "Pasaje ficticio." }]), false);
    assert.equal(assistantReferencesValid('[R1] «Texto inventado.»', [{ marker: "R1", quote: "Pasaje ficticio." }]), false);
    assert.equal(assistantReferencesValid('> Texto inventado. [R1]', [{ marker: "R1", quote: "Pasaje ficticio." }]), false);
    const destination = { ...expectedDestination, endpoint: "Proveedor ficticio", remote: true, permitted: true, key: "a".repeat(64) };
    assert.throws(() => checkAltazorDestination(destination, destination.key, false), error => (error as { status: number }).status === 403);
    assert.throws(() => checkAltazorDestination(destination, "b".repeat(64), true), error => (error as { status: number }).status === 409);
    assert.equal(createConversationSchema.safeParse({ requestId: "fixture-key", causaId: null, scopeKey: "causa:unauthorized" }).success, false);
    assert.equal(createTurnSchema.safeParse({ requestId: "fixture-key", expectedRevision: 1, text: "Hola", destinationKey: destination.key, attachmentIds: ["same", "same"] }).success, false);
    const form = new FormData(); form.set("requestId", "fixture-upload"); form.set("file", new File(["Texto ficticio"], "nota.txt"));
    const upload = await readAltazorUpload(new Request("http://fixture.invalid/attachments", { method: "POST", body: form })); assert.equal(upload.bytes.toString(), "Texto ficticio");
    const duplicate = new FormData(); duplicate.append("requestId", "fixture-upload"); duplicate.append("requestId", "duplicate-key"); duplicate.set("file", new File(["x"], "note.txt"));
    await assert.rejects(readAltazorUpload(new Request("http://fixture.invalid", { method: "POST", body: duplicate })), error => (error as { status: number }).status === 400);
    console.log("ALTAZOR unit fixtures: classifier isolation, authorized history/context, cancellation, destination consent and bounded upload passed (zero network/DB).");
  } finally { globals.prisma = previous; globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]; Object.assign(process.env, originalEnv); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
