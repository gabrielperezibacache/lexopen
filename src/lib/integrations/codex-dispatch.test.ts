import assert from "node:assert/strict";

async function main() {
  const globals = globalThis as unknown as { prisma?: unknown; lexopenCodexSessions?: unknown; lexopenHostCodexSessions?: unknown };
  const previousPrisma = globals.prisma, previousManager = globals.lexopenCodexSessions, previousHost = globals.lexopenHostCodexSessions, originalFetch = globalThis.fetch;
  const env = { ...process.env };
  let localOnly = false, enabled = true, revoked = false, fail = false, codexCalls = 0, providerCalls = 0;
  let source = "personal", revision = "first", shared = false, hostRevision = "first-host", hostCalls = 0, codexModel = "fixture-model";
  const activity: { mensaje: string }[] = [];
  globals.prisma = {
    integrationConfig: { findUnique: async ({ where }: { where: { provider: string } }) => where.provider === "codex:professional_a" ? { provider: where.provider, enabled, configJson: JSON.stringify({ model: "fixture-model", source, revision }) } : where.provider === "codex-host" ? { provider: where.provider, enabled: shared, configJson: JSON.stringify({ revision: hostRevision }) } : null },
    user: { findUnique: async () => ({ role: "abogado", capabilityGrants: "", capabilityRevokes: revoked ? "assistant.use" : "" }) },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: localOnly ? "local_only" : "remote_allowed", auditLlmPrompts: false, hermesAllowDemo: false }) },
    activity: { create: async ({ data }: { data: { mensaje: string } }) => { activity.push(data); return data; } },
  };
  globals.lexopenCodexSessions = { complete: async (id: string, messages: unknown, options: { model: string }) => { assert.equal(id, "professional_a"); assert.ok(Array.isArray(messages)); assert.equal(options.model, codexModel); codexCalls++; if (fail) throw Error("simulated provider failure containing a credential"); return { content: "PRIVATE ANSWER TO REVIEW", model: options.model, provider: "codex" }; } };
  globals.lexopenHostCodexSessions = { complete: async (id: string, messages: unknown, options: { model: string; beforeSend?: () => Promise<void> }) => { assert.equal(id, "lexopen_host"); assert.ok(Array.isArray(messages)); await options.beforeSend?.(); hostCalls++; if (fail) throw Error("private Host credential"); return { content: "HOST ANSWER TO REVIEW", model: options.model, provider: "codex" }; } };
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
    fail = false;
    const { codexDestinationFor } = await import("./codex-destination");
    const { personalCodexPreference } = await import("./codex-preference");
    const destination = async () => ({ provider: "codex", model: "fixture-model", ...await codexDestinationFor("professional_a", await personalCodexPreference("professional_a")) });
    const personalApproval = await destination();
    const routeModel = "icaro-codex-model";
    const routePreference = await personalCodexPreference("professional_a");
    const routeApproval = { provider: "codex", model: routeModel, ...await codexDestinationFor("professional_a", { ...routePreference, model: routeModel }) };
    codexModel = routeModel;
    const routed = await askLlm({ ...input, route: { provider: "codex", model: routeModel }, expectedDestination: routeApproval });
    assert.equal(routed.source, "llm"); assert.equal(routed.model, routeModel); assert.equal(codexCalls, 2);
    codexModel = "fixture-model";
    const beforeSwitch = codexCalls;
    source = "host"; shared = true;
    const mismatched = await askLlm({ ...input, expectedDestination: personalApproval }); assert.equal("code" in mismatched && mismatched.code, "llm_destination_changed"); assert.equal(hostCalls, 0); assert.equal(codexCalls, beforeSwitch);
    const hostApproval = await destination();
    const hostResponse = await askLlm({ ...input, expectedDestination: hostApproval }); assert.equal(hostResponse.source, "llm"); assert.equal(hostResponse.content, "HOST ANSWER TO REVIEW"); assert.match(hostResponse.note ?? "", /Host/); assert.equal(hostCalls, 1); assert.equal(codexCalls, beforeSwitch);
    localOnly = true;
    const localHost = await askLlm(input); assert.equal("code" in localHost && localHost.code, "llm_remote_forbidden"); assert.equal(hostCalls, 1); localOnly = false;
    shared = false; hostRevision = "revoked-host";
    const unavailable = await askLlm(input); assert.equal("code" in unavailable && unavailable.code, "codex_host_unavailable"); assert.equal(hostCalls, 1); assert.equal(codexCalls, beforeSwitch); assert.equal(providerCalls, 2);
    shared = true; hostRevision = "new-host-account";
    const staleHost = await askLlm({ ...input, expectedDestination: hostApproval }); assert.equal("code" in staleHost && staleHost.code, "llm_destination_changed"); assert.equal(hostCalls, 1);
    const currentApproval = await destination(); revision = "new-user-choice";
    const staleUser = await askLlm({ ...input, expectedDestination: currentApproval }); assert.equal("code" in staleUser && staleUser.code, "llm_destination_changed"); assert.equal(hostCalls, 1);
    fail = true; const failedHost = await askLlm(input); assert.equal(failedHost.source, "error"); assert.ok(!JSON.stringify(failedHost).includes("credential")); assert.equal(codexCalls, beforeSwitch); assert.equal(providerCalls, 2);
  } finally {
    globals.prisma = previousPrisma; globals.lexopenCodexSessions = previousManager; globals.lexopenHostCodexSessions = previousHost; globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
  }
  console.log("Codex dispatch: personal/Host routing, opt-in, revocation, account-bound approval, capabilities and no fallback passed (zero network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
