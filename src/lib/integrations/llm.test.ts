import assert from "node:assert/strict";
import {
  applyPreset,
  askLlm,
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
import { prisma } from "@/lib/db";

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
assert.match(prompt, /Eres Altazor/);
assert.doesNotMatch(prompt, /para un estudio de abogados en Chile|inspirado en/);
assert.match(prompt, /Andes/);
assert.match(prompt, /<<<CONTEXTO_NO_CONFIABLE>>>\n\{"cliente":"Andes"\}\n<<<FIN_CONTEXTO_NO_CONFIABLE>>>/);

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

assert.equal(
  resolveAllowDemoFlag(true, { NODE_ENV: "production" }),
  false
);
assert.equal(
  resolveAllowDemoFlag(false, { NODE_ENV: "production", LLM_ALLOW_DEMO: "1" }),
  true
);
assert.equal(
  resolveAllowDemoFlag(true, { NODE_ENV: "production", LLM_ALLOW_DEMO: "0" }),
  false
);
assert.equal(
  resolveAllowDemoFlag(true, { NODE_ENV: "development" }),
  true
);
assert.equal(
  resolveAllowDemoFlag(false, { NODE_ENV: "development" }),
  false
);

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

async function runMissingApiKeyGuardTests() {
const llmTestEnvKeys = [
  "NODE_ENV", "LLM_API_URL", "HERMES_API_URL", "LLM_API_KEY", "HERMES_API_KEY",
  "LLM_MODEL", "HERMES_MODEL", "LLM_ALLOW_DEMO", "HERMES_ALLOW_DEMO", "LLM_ALLOW_PRIVATE_URL",
];
const priorLlmTestEnv = new Map(llmTestEnvKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalConfigFindUnique = prisma.integrationConfig.findUnique;
const originalFirmFindFirst = prisma.firmSettings.findFirst;
const originalActivityCreate = prisma.activity.create;
const testPrisma = prisma as unknown as {
  integrationConfig: { findUnique: (...args: unknown[]) => Promise<unknown> };
  firmSettings: { findFirst: (...args: unknown[]) => Promise<unknown> };
  activity: { create: (args: { data: { mensaje?: string; causaId?: string } }) => Promise<unknown> };
};
const fetchCalls: string[] = [];
let warnCalls = 0;
const demoActivities: Array<{ mensaje?: string; causaId?: string }> = [];

try {
  testPrisma.integrationConfig.findUnique = async () => null;
  testPrisma.firmSettings.findFirst = async () => null;
  testPrisma.activity.create = (async ({ data }: { data: { mensaje?: string; causaId?: string } }) => {
    demoActivities.push(data);
    return data;
  });
  console.warn = (() => { warnCalls += 1; }) as typeof console.warn;
  globalThis.fetch = (async (input) => {
    fetchCalls.push(String(input));
    return new Response(JSON.stringify({ choices: [{ message: { content: "Synthetic provider response" } }] }), { status: 200 });
  }) as typeof fetch;

  const configureWithoutApiKey = (url?: string, allowDemo?: "0" | "1") => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    for (const key of ["LLM_API_URL", "HERMES_API_URL", "LLM_API_KEY", "HERMES_API_KEY", "LLM_MODEL", "HERMES_MODEL", "LLM_ALLOW_DEMO", "HERMES_ALLOW_DEMO", "LLM_ALLOW_PRIVATE_URL"]) delete process.env[key];
    if (url) process.env.LLM_API_URL = url;
    if (allowDemo) process.env.LLM_ALLOW_DEMO = allowDemo;
  };
  const input = { messages: [{ role: "user" as const, content: "Synthetic key guard fixture" }] };

  configureWithoutApiKey();
  const missingOpenAiKey = await askLlm(input);
  assert.equal(missingOpenAiKey.source, "error");
  assert.equal(missingOpenAiKey.provider, "openai");
  assert.equal("code" in missingOpenAiKey && missingOpenAiKey.code, "llm_unconfigured");
  assert.equal("error" in missingOpenAiKey && missingOpenAiKey.error, "El proveedor de IA no tiene API key configurada.");
  assert.equal("note" in missingOpenAiKey && missingOpenAiKey.note, "Falta configurar la API key del proveedor de IA en Configuración → IA.");
  assert.equal(fetchCalls.length, 0, "default OpenAI without a key must not call fetch");
  assert.equal(warnCalls, 0, "missing-key errors must not log provider warnings");

  configureWithoutApiKey(undefined, "1");
  const demo = await askLlm({ ...input, causaId: "fixture-causa" });
  assert.equal(demo.source, "demo");
  assert.equal(fetchCalls.length, 0, "missing-key demo must not call fetch");
  assert.equal(warnCalls, 0, "missing-key demo must not log provider warnings");
  assert.equal(demoActivities.length, 1, "demo mode still records the case activity");
  assert.equal(demoActivities[0]?.causaId, "fixture-causa");

  for (const [provider, url] of [
    ["groq", "https://api.groq.com/openai/v1"],
    ["azure", "https://lexopen-fixture.openai.azure.com/openai/deployments/fixture"],
  ] as const) {
    configureWithoutApiKey(url);
    const missingKey = await askLlm(input);
    assert.equal(missingKey.source, "error", `${provider} without an API key fails before fetch`);
    assert.equal(missingKey.provider, provider);
    assert.equal("code" in missingKey && missingKey.code, "llm_unconfigured");
    assert.equal(fetchCalls.length, 0);
    assert.equal(warnCalls, 0);
  }

  configureWithoutApiKey("http://localhost:11434/v1");
  process.env.LLM_ALLOW_PRIVATE_URL = "1";
  const loopback = await askLlm(input);
  assert.equal(loopback.source, "llm", "loopback providers remain callable without a key");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], "http://localhost:11434/v1/chat/completions");

  configureWithoutApiKey("https://example.com/v1");
  const customWithoutKey = await askLlm(input);
  assert.equal(customWithoutKey.source, "llm", "custom providers remain callable without a key");
  assert.equal(customWithoutKey.provider, "custom");
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[1], "https://example.com/v1/chat/completions");
  assert.equal(warnCalls, 0);
} finally {
  testPrisma.integrationConfig.findUnique = originalConfigFindUnique as unknown as (...args: unknown[]) => Promise<unknown>;
  testPrisma.firmSettings.findFirst = originalFirmFindFirst as unknown as (...args: unknown[]) => Promise<unknown>;
  testPrisma.activity.create = originalActivityCreate as unknown as (args: { data: { mensaje?: string; causaId?: string } }) => Promise<unknown>;
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  for (const key of llmTestEnvKeys) {
    const value = priorLlmTestEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await prisma.$disconnect();
}
}

runMissingApiKeyGuardTests().then(() => {
  console.log("integrations/llm.test.ts OK");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
