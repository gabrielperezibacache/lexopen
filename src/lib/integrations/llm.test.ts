import assert from "node:assert/strict";
import {
  applyPreset,
  LLM_PRESETS,
  LLM_PRESET_CATALOG,
  legalSystemPrompt,
} from "./llm";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";

assert.ok(LLM_PRESETS.openai.apiUrl.includes("openai.com"));
assert.ok(LLM_PRESETS.groq.apiUrl.includes("groq.com"));
assert.equal(LLM_PRESETS.ollama.apiUrl.includes("11434"), true);
assert.ok(LLM_PRESET_CATALOG.custom.label.includes("Personalizado"));
assert.ok(LLM_PRESET_CATALOG.azure.label.includes("Azure"));

const openai = applyPreset("openai");
assert.equal(openai.preset, "openai");
assert.equal(openai.apiUrl, LLM_PRESETS.openai.apiUrl);
assert.equal(openai.model, LLM_PRESETS.openai.model);

const custom = applyPreset("custom", {
  apiUrl: "https://example.com/v1",
  model: "my-model",
});
assert.equal(custom.preset, "custom");
assert.equal(custom.apiUrl, "https://example.com/v1");

const prompt = legalSystemPrompt({ context: '{"cliente":"Andes"}' });
assert.match(prompt, /Chile/);
assert.match(prompt, /Andes/);

const legacy = legalSystemPrompt("contexto legacy");
assert.match(legacy, /contexto legacy/);

const sealed = encryptSecret("sk-test-llm-key");
assert.match(sealed, /^enc:v2:/);
assert.equal(decryptSecret(sealed, { strict: true }), "sk-test-llm-key");
assert.equal(decryptSecret("sk-legacy-plain", { strict: true }), undefined);
assert.equal(decryptSecret("sk-legacy-plain", { strict: false }), "sk-legacy-plain");

console.log("integrations/llm.test.ts OK");
