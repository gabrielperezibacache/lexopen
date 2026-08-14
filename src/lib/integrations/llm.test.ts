import assert from "node:assert/strict";
import {
  applyPreset,
  classifyLlmProviderError,
  describeLlmProviderError,
  LLM_PRESETS,
  LLM_PRESET_CATALOG,
  legalSystemPrompt,
  looksLikeSse,
  llmEnvSnippet,
  parseChatCompletionBody,
  resolveAllowDemoFlag,
  sanitizeLlmMessages,
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

const sanitized = sanitizeLlmMessages([
  { role: "system", content: "sys" },
  { role: "user", content: "  " },
  { role: "user", content: "hola" },
  { role: "assistant", content: "ok" },
  { role: "user", content: "x".repeat(20_000) },
]);
assert.equal(sanitized.length, 4);
assert.equal(sanitized[0]?.role, "system");
assert.ok((sanitized.at(-1)?.content.length ?? 0) <= 12000);

const trimmed = sanitizeLlmMessages(
  [
    { role: "system", content: "sys" },
    ...Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`,
    })),
  ],
  6
);
assert.equal(trimmed.length, 6);
assert.equal(trimmed[0]?.role, "system");

// Production fail-closed: unset / explicit 0 must not enable demo.
function envAllowsDemo(env: {
  NODE_ENV?: string;
  LLM_ALLOW_DEMO?: string;
  HERMES_ALLOW_DEMO?: string;
}) {
  return (
    env.LLM_ALLOW_DEMO === "1" ||
    env.HERMES_ALLOW_DEMO === "1" ||
    (env.LLM_ALLOW_DEMO !== "0" &&
      env.HERMES_ALLOW_DEMO !== "0" &&
      env.NODE_ENV !== "production")
  );
}
assert.equal(envAllowsDemo({ NODE_ENV: "production" }), false);
assert.equal(
  envAllowsDemo({ NODE_ENV: "production", LLM_ALLOW_DEMO: "0" }),
  false
);
assert.equal(
  envAllowsDemo({ NODE_ENV: "production", LLM_ALLOW_DEMO: "1" }),
  true
);
assert.equal(envAllowsDemo({ NODE_ENV: "development" }), true);

{
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    LLM_ALLOW_DEMO: process.env.LLM_ALLOW_DEMO,
    HERMES_ALLOW_DEMO: process.env.HERMES_ALLOW_DEMO,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.LLM_ALLOW_DEMO;
    delete process.env.HERMES_ALLOW_DEMO;
    assert.equal(resolveAllowDemoFlag(true), false);
    process.env.LLM_ALLOW_DEMO = "1";
    assert.equal(resolveAllowDemoFlag(false), true);
    process.env.LLM_ALLOW_DEMO = "0";
    assert.equal(resolveAllowDemoFlag(true), false);
    process.env.NODE_ENV = "development";
    delete process.env.LLM_ALLOW_DEMO;
    assert.equal(resolveAllowDemoFlag(true), true);
    assert.equal(resolveAllowDemoFlag(false), false);
  } finally {
    process.env.NODE_ENV = prev.NODE_ENV;
    if (prev.LLM_ALLOW_DEMO === undefined) delete process.env.LLM_ALLOW_DEMO;
    else process.env.LLM_ALLOW_DEMO = prev.LLM_ALLOW_DEMO;
    if (prev.HERMES_ALLOW_DEMO === undefined) delete process.env.HERMES_ALLOW_DEMO;
    else process.env.HERMES_ALLOW_DEMO = prev.HERMES_ALLOW_DEMO;
  }
}

assert.equal(
  parseChatCompletionBody(
    JSON.stringify({ choices: [{ message: { content: "  OK  " } }] })
  ),
  "OK"
);
assert.equal(
  parseChatCompletionBody(
    JSON.stringify({
      choices: [{ message: { content: [{ type: "text", text: "Hola" }] } }],
    })
  ),
  "Hola"
);

const sse = `data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"O"}}]}

data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"K"}}]}

data: [DONE]
`;
assert.equal(looksLikeSse(sse), true);
assert.equal(parseChatCompletionBody(sse), "OK");
assert.equal(
  parseChatCompletionBody(
    `data: {"choices":[{"message":{"content":"listo"}}]}\n\ndata: [DONE]\n`
  ),
  "listo"
);

const sseParseError = new SyntaxError(
  `Unexpected token 'd', "data: {"id"... is not valid JSON`
);
assert.match(describeLlmProviderError(sseParseError), /formato no usable|SSE|OpenAI/i);
assert.equal(classifyLlmProviderError(sseParseError).code, "llm_bad_response");
assert.equal(
  classifyLlmProviderError(new Error("LLM HTTP 401: invalid_api_key")).code,
  "llm_http_4xx"
);
assert.equal(
  classifyLlmProviderError(new Error("LLM HTTP 502: bad gateway")).code,
  "llm_http_5xx"
);
assert.equal(
  classifyLlmProviderError(new Error("fetch failed")).code,
  "llm_unreachable"
);
assert.doesNotMatch(
  classifyLlmProviderError(new Error("LLM HTTP 401: sk-secret-leak")).message,
  /sk-secret/
);

assert.equal(
  llmEnvSnippet({
    apiUrl: "https://openrouter.ai/api/v1/",
    model: "openai/gpt-4o-mini",
    allowDemo: false,
    apiKey: "sk-secret",
  }),
  [
    "LLM_API_URL=https://openrouter.ai/api/v1",
    "LLM_API_KEY=••••",
    "LLM_MODEL=openai/gpt-4o-mini",
    "LLM_ALLOW_DEMO=0",
    "# Compat: HERMES_API_URL / HERMES_API_KEY / HERMES_ALLOW_DEMO",
  ].join("\n")
);
assert.match(llmEnvSnippet({ apiUrl: "https://api.openai.com/v1" }), /LLM_API_KEY=\n/);

console.log("integrations/llm.test.ts OK");
