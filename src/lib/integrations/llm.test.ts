import assert from "node:assert/strict";
import { applyPreset, LLM_PRESETS, legalSystemPrompt } from "./llm";

assert.ok(LLM_PRESETS.openai.apiUrl.includes("openai.com"));
assert.ok(LLM_PRESETS.groq.apiUrl.includes("groq.com"));
assert.equal(LLM_PRESETS.ollama.apiUrl.includes("11434"), true);

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

const prompt = legalSystemPrompt('{"cliente":"Andes"}');
assert.match(prompt, /Chile/);
assert.match(prompt, /Andes/);

console.log("integrations/llm.test.ts OK");
