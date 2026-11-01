/** Whole-turn privacy regression: every provider request is intercepted in memory. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  let mode = "local_only";
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const actor = { id: "egress-fixture-user", role: "socio", capabilityGrants: "", capabilityRevokes: "" };
  const document = { id: "egress-fixture-doc", nombre: "fixture.txt", contenido: "Contenido ficticio privado", extractedMarkdown: null, causaId: null, autorId: actor.id, confidencial: false, privilegio: false };
  const fake = {
    user: { findUnique: async () => actor },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: mode, auditLlmPrompts: false, hermesAllowDemo: false }) },
    integrationConfig: { findUnique: async () => null },
    assistantPlanRecord: { create: async () => ({ id: randomUUID() }) },
    documento: { findFirst: async () => document },
  };
  const globals = globalThis as unknown as { prisma?: unknown };
  const previousPrisma = globals.prisma;
  globals.prisma = fake;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.LLM_API_URL = "https://203.0.113.10/v1";
  process.env.LLM_API_KEY = "synthetic-non-secret";
  process.env.LLM_ALLOW_DEMO = "0";
  process.env.HERMES_ALLOW_DEMO = "0";
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ choices: [{ message: { content: "Synthetic answer" } }] }), { status: 200 });
  };
  try {
    const { runAssistantTurn } = await import("./pipeline");
    const { documentoResumirTool } = await import("./tools/documento");
    const { askLlm } = await import("@/lib/integrations/llm");
    const result = await runAssistantTurn({ text: "Explícame la confidencialidad profesional", user: actor as typeof actor & { role: "socio" } });
    assert.equal(result.classification.source, "rule");
    assert.deepEqual(result.classification.toolIds, ["respuesta.libre"]);
    assert.equal(requests.length, 0, "local_only whole-turn fallback must never reach fetch");
    assert.equal(result.autoResults?.[0].result.ok, false);
    const summary = await documentoResumirTool.execute({ documentoId: document.id }, { userId: actor.id, role: "socio" });
    assert.equal(summary.ok, false);
    assert.equal(requests.length, 0, "local_only document tools must not egress either");
    const blocked = await askLlm({ messages: [{ role: "user", content: "private fixture" }] });
    assert.equal(blocked.source, "error");
    assert.equal("code" in blocked && blocked.code, "llm_remote_forbidden");
    assert.equal(requests.length, 0);
    process.env.LLM_API_URL = "http://localhost:11434/v1";
    const local = await askLlm({ messages: [{ role: "user", content: "local fixture" }] });
    assert.equal(local.source, "llm", "a configured loopback model remains usable in production");
    assert.deepEqual(requests, ["http://localhost:11434/v1/chat/completions"]);
    mode = "remote_allowed";
    process.env.LLM_API_URL = "https://203.0.113.10/v1";
    const remote = await askLlm({ messages: [{ role: "user", content: "authorized fixture" }] });
    assert.equal(remote.source, "llm");
    assert.equal(requests.length, 2, "remote_allowed preserves authorized use");
    actor.capabilityRevokes = "assistant.use";
    const revoked = await askLlm({ userId: actor.id, messages: [{ role: "user", content: "revoked fixture" }] });
    assert.equal("code" in revoked && revoked.code, "llm_forbidden");
    assert.equal(requests.length, 2, "current capability revocation applies at the common provider boundary");
  } finally {
    globalThis.fetch = originalFetch;
    globals.prisma = previousPrisma;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
  console.log("assistant whole-turn egress policy tests ok (zero network)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
