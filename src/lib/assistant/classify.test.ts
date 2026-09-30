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

async function main() {
  await testLocalOnlyNeverCallsLlm();
  await testForceLocalNeverCallsLlm();
  await testRemoteAllowedStillCallsLlm();
  await testPromptAlwaysReturned();
  console.log("assistant/classify.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
