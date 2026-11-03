import assert from "node:assert/strict";

async function main() {
  const globals = globalThis as unknown as { prisma?: unknown; lexopenCodexSessions?: unknown };
  const previousPrisma = globals.prisma, previousManager = globals.lexopenCodexSessions, originalFetch = globalThis.fetch;
  const env = { ...process.env };
  let localOnly = false, enabled = true, revoked = false, fail = false, codexCalls = 0, providerCalls = 0;
  const activity: { mensaje: string }[] = [];
  globals.prisma = {
    integrationConfig: { findUnique: async ({ where }: { where: { provider: string } }) => where.provider === "codex:professional_a" ? { provider: where.provider, enabled, configJson: JSON.stringify({ model: "fixture-model" }) } : null },
    user: { findUnique: async () => ({ role: "abogado", capabilityGrants: "", capabilityRevokes: revoked ? "assistant.use" : "" }) },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: localOnly ? "local_only" : "remote_allowed", auditLlmPrompts: false, hermesAllowDemo: false }) },
    activity: { create: async ({ data }: { data: { mensaje: string } }) => { activity.push(data); return data; } },
  };
  globals.lexopenCodexSessions = { complete: async (id: string, messages: unknown, options: { model: string }) => { assert.equal(id, "professional_a"); assert.ok(Array.isArray(messages)); assert.equal(options.model, "fixture-model"); codexCalls++; if (fail) throw Error("simulated provider failure containing a credential"); return { content: "PRIVATE ANSWER TO REVIEW", model: options.model, provider: "codex" }; } };
  process.env.LLM_API_URL = "https://203.0.113.10/v1"; process.env.LLM_API_KEY = "synthetic-non-secret"; process.env.LLM_ALLOW_DEMO = "0";
  globalThis.fetch = async () => { providerCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: "Study provider answer" } }] })); };
  try {
    const { askLlm } = await import("./llm");
    const input = { userId: "professional_a", causaId: "case_a", messages: [{ role: "user" as const, content: "Selected fictitious passage" }] };
    localOnly = true;
    const blocked = await askLlm(input);
    assert.equal("code" in blocked && blocked.code, "llm_remote_forbidden"); assert.equal(codexCalls, 0); assert.equal(providerCalls, 0);
    localOnly = false;
    const response = await askLlm(input);
    assert.equal(response.source, "llm"); assert.equal(response.provider, "codex"); assert.equal(response.content, "PRIVATE ANSWER TO REVIEW"); assert.equal(response.requireApproval, true);
    assert.equal(codexCalls, 1); assert.equal(providerCalls, 0); assert.equal(activity.length, 1); assert.ok(!activity[0].mensaje.includes("PRIVATE ANSWER"));
    const other = await askLlm({ ...input, userId: "professional_b", causaId: undefined });
    assert.notEqual(other.provider, "codex"); assert.equal(codexCalls, 1); assert.equal(providerCalls, 1);
    enabled = false;
    await askLlm({ ...input, causaId: undefined }); assert.equal(codexCalls, 1); assert.equal(providerCalls, 2);
    enabled = true; revoked = true;
    const revokedResult = await askLlm(input); assert.equal("code" in revokedResult && revokedResult.code, "llm_forbidden"); assert.equal(codexCalls, 1); assert.equal(providerCalls, 2);
    revoked = false; fail = true;
    const failed = await askLlm(input); assert.equal(failed.source, "error"); assert.equal("code" in failed && failed.code, "codex_request_failed"); assert.ok(!JSON.stringify(failed).includes("credential")); assert.equal(providerCalls, 2, "a failed personal request must never fall back to another remote provider");
  } finally {
    globals.prisma = previousPrisma; globals.lexopenCodexSessions = previousManager; globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
  }
  console.log("Personal Codex dispatch: policy, capabilities, isolation and fail-closed checks passed (zero network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
