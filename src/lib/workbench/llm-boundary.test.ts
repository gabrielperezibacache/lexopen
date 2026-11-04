/** In-memory transports only: destination consent and cancellation at the real shared boundary. */
import assert from "node:assert/strict";
import { sha256 } from "@/lib/evidence/fragments";
async function main() {
  const globals = globalThis as unknown as { prisma?: unknown; lexopenCodexSessions?: unknown }, previous = { db: globals.prisma, manager: globals.lexopenCodexSessions, fetch: globalThis.fetch, env: { ...process.env } };
  let personal = false, receivedSignal: AbortSignal | undefined, calls = 0, remoteCalls = 0;
  globals.prisma = {
    integrationConfig: { findUnique: async ({ where }: { where: { provider: string } }) => where.provider === "codex:fixture" && personal ? { provider: where.provider, enabled: true, configJson: JSON.stringify({ model: "fixture-model" }) } : null },
    user: { findUnique: async () => ({ role: "abogado", capabilityGrants: "", capabilityRevokes: "" }) },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: "remote_allowed", auditLlmPrompts: false }) },
  };
  globals.lexopenCodexSessions = { complete: async (_actor: string, _messages: unknown, options: { model: string; signal?: AbortSignal }) => { receivedSignal = options.signal; calls++; return { content: "fictitious draft", model: options.model, provider: "codex" }; } };
  process.env.LLM_API_URL = "https://203.0.113.10/v1"; process.env.LLM_API_KEY = "fictitious-not-secret"; process.env.LLM_MODEL = "fixture-study"; process.env.LLM_ALLOW_DEMO = "0";
  globalThis.fetch = async (_url, init) => { remoteCalls++; receivedSignal = init?.signal || undefined; if (init?.signal?.aborted) throw init.signal.reason; return new Response(JSON.stringify({ choices: [{ message: { content: "fictitious study draft" } }] })); };
  try {
    const { askLlm, getLlmConfig } = await import("@/lib/integrations/llm"); const config = await getLlmConfig();
    const input = { userId: "fixture", messages: [{ role: "user" as const, content: "Fictitious selected text only" }] };
    const control = new AbortController();
    const changed = await askLlm({ ...input, expectedDestination: { provider: config.preset, model: config.model, endpointHash: sha256("another endpoint") } });
    assert.equal("code" in changed && changed.code, "llm_destination_changed"); assert.equal(remoteCalls, 0);
    const response = await askLlm({ ...input, signal: control.signal, expectedDestination: { provider: config.preset, model: config.model, endpointHash: sha256(config.apiUrl) } });
    assert.equal(response.source, "llm"); assert.equal(remoteCalls, 1); assert.ok(receivedSignal && !receivedSignal.aborted); control.abort(); assert.equal(receivedSignal.aborted, true, "the shared outbound transport receives the caller's cancellation");
    personal = true;
    await askLlm({ ...input, expectedDestination: { provider: config.preset, model: config.model, endpointHash: sha256(config.apiUrl) } }); assert.equal(calls, 0, "enabling personal Codex after approval cannot silently reroute a study request");
    const personalControl = new AbortController();
    await askLlm({ ...input, signal: personalControl.signal, expectedDestination: { provider: "codex", model: "fixture-model", endpointHash: sha256("codex") } });
    assert.equal(calls, 1); assert.equal(receivedSignal, personalControl.signal, "personal Codex receives the same cancellation signal");
    personal = false;
    await askLlm({ ...input, expectedDestination: { provider: "codex", model: "fixture-model", endpointHash: sha256("codex") } }); assert.equal(remoteCalls, 1, "disconnecting Codex cannot fall back to a different unapproved provider");
    const aborted = new AbortController(); aborted.abort(); await assert.rejects(askLlm({ ...input, signal: aborted.signal })); assert.equal(remoteCalls, 1);
    console.log("Workbench LLM boundary: destination pinning, fail-closed routing and propagated cancellation passed with zero network.");
  } finally { globals.prisma = previous.db; globals.lexopenCodexSessions = previous.manager; globalThis.fetch = previous.fetch; for (const key of Object.keys(process.env)) if (!(key in previous.env)) delete process.env[key]; Object.assign(process.env, previous.env); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
