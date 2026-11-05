/**
 * `classifyIntents` con `assistantLlmMode: "local_only"` (o `forceLocal`)
 * nunca debe invocar `askLlm`: la clasificación siempre cae a `ruleClassify`.
 * Complementa `assistant.contract.test.ts` (filtrado de toolIds inyectados).
 */

import assert from "node:assert/strict";
import { classifyIntents } from "./classify";
import { normalizeAssistantInput } from "./normalize";
import type { askLlm } from "@/lib/integrations/llm";

const NOW = new Date("2026-09-30T15:00:00.000Z");

const throwingAskLlm: typeof askLlm = async () => {
  throw new Error("askLlm no debe llamarse en modo local_only");
};

async function testLocalOnlyNeverCallsLlm() {
  const normalized = normalizeAssistantInput(
    "agenda una audiencia para el lunes",
    NOW
  );
  const result = await classifyIntents(normalized, {
    askLlm: throwingAskLlm,
    assistantLlmMode: "local_only",
  });
  assert.equal(result.source, "rule", "local_only siempre usa reglas");
  assert.ok(result.intents.length >= 1, "sigue devolviendo al menos un intent");
}

async function testForceLocalNeverCallsLlm() {
  const normalized = normalizeAssistantInput("crea una tarea de seguimiento", NOW);
  const result = await classifyIntents(normalized, {
    askLlm: throwingAskLlm,
    forceLocal: true,
  });
  assert.equal(result.source, "rule", "forceLocal siempre usa reglas");
}

async function testRemoteAllowedStillCallsLlm() {
  const fakeAskLlm: typeof askLlm = async () => ({
    source: "llm",
    content: JSON.stringify({
      intents: [{ toolId: "buscar", confidence: 0.9, slots: { q: "Pérez" } }],
    }),
    requireApproval: false,
    provider: "custom",
    model: "test-model",
  });
  const normalized = normalizeAssistantInput("busca a Pérez", NOW);
  const result = await classifyIntents(normalized, {
    askLlm: fakeAskLlm,
    assistantLlmMode: "remote_allowed",
  });
  assert.equal(result.source, "llm", "remote_allowed sí puede usar el LLM");
}

async function testPromptAlwaysReturned() {
  const normalized = normalizeAssistantInput("crea una nota", NOW);
  const result = await classifyIntents(normalized, {
    askLlm: throwingAskLlm,
    assistantLlmMode: "local_only",
  });
  assert.equal(typeof result.prompt, "string");
  assert.ok(result.prompt.length > 0, "prompt disponible para auditoría opt-in");
}
async function testExplicitAltazorDesktopReadWinsBeforeModel() {
  let calls = 0;
  const wrongModel: typeof askLlm = async () => { calls++; return { source: "llm", content: JSON.stringify({ intents: [{ toolId: "buscar", confidence: 1, slots: { q: "incorrect context tool" } }] }), requireApproval: false, provider: "custom", model: "fictitious-misrouter" }; };
  const input = normalizeAssistantInput("Solo muéstrame los escritorios de ALTAZOR de este espacio.", NOW);
  const result = await classifyIntents(input, { altazorContext: true, askLlm: wrongModel, assistantLlmMode: "remote_allowed" });
  assert.equal(result.source, "rule"); assert.deepEqual(result.intents.map(item => item.toolId), ["escritorio.listar"]); assert.equal(calls, 0);
  const generic = await classifyIntents(input, { askLlm: wrongModel, assistantLlmMode: "remote_allowed" });
  assert.equal(generic.source, "llm"); assert.equal(calls, 1, "la prioridad se limita al contexto ALTAZOR declarado por el servidor");
  for (const text of ["No muestres los escritorios", "Muéstrame los escritorios y crea una nota", "¿Muéstrame los escritorios o crea uno?"]) {
    const normal = await classifyIntents(normalizeAssistantInput(text, NOW), { altazorContext: true, askLlm: wrongModel, assistantLlmMode: "remote_allowed" });
    assert.equal(normal.source, "llm", "las peticiones negadas o compuestas no adelantan una lectura");
  }
}

async function main() {
  await testLocalOnlyNeverCallsLlm();
  await testForceLocalNeverCallsLlm();
  await testRemoteAllowedStillCallsLlm();
  await testPromptAlwaysReturned();
  await testExplicitAltazorDesktopReadWinsBeforeModel();
  console.log("assistant/classify.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
