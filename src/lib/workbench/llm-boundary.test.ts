/** In-memory transports only: destination consent and cancellation at the real shared boundary. */
import assert from "node:assert/strict";
import { sha256 } from "@/lib/evidence/fragments";
import { LOCAL_MODELS, OLLAMA_LOCAL_ORIGIN, type LocalModelId } from "@/lib/integrations/local-model-profiles";

async function main() {
  const globals = globalThis as unknown as { prisma?: unknown; lexopenCodexSessions?: unknown }, previous = { db: globals.prisma, manager: globals.lexopenCodexSessions, fetch: globalThis.fetch, env: { ...process.env } };
  let personal = false, receivedSignal: AbortSignal | undefined, calls = 0, remoteCalls = 0;
  let selectedLocal: LocalModelId | null = null;
  let role = "abogado";
  const caseActivity: string[] = [];
  const db = {
    integrationConfig: { findUnique: async ({ where }: { where: { provider: string } }) => {
      if (where.provider === "llm-local" && selectedLocal) return { enabled: true, configJson: JSON.stringify({ profileId: selectedLocal }) };
      if (where.provider === "codex:fixture" && personal) return { provider: where.provider, enabled: true, configJson: JSON.stringify({ model: "fixture-model" }) };
      return null;
    }, upsert: async ({ where, update }: { where: { provider: string }; update: { configJson: string } }) => {
      assert.equal(where.provider, "llm-local");
      selectedLocal = JSON.parse(update.configJson).profileId;
    }, updateMany: async ({ where }: { where: { provider: string } }) => {
      assert.equal(where.provider, "llm-local");
      selectedLocal = null;
    } },
    auditEvent: { create: async () => ({}) },
    activity: { create: async ({ data }: { data: { mensaje: string } }) => { caseActivity.push(data.mensaje); return {}; } },
    user: { findUnique: async () => ({ role, capabilityGrants: "", capabilityRevokes: "" }) },
    firmSettings: { findFirst: async () => ({ assistantLlmMode: "remote_allowed", auditLlmPrompts: false }) },
  };
  globals.prisma = { ...db, $transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db) };
  globals.lexopenCodexSessions = { complete: async (_actor: string, _messages: unknown, options: { model: string; signal?: AbortSignal }) => { receivedSignal = options.signal; calls++; return { content: "fictitious draft", model: options.model, provider: "codex" }; } };
  process.env.LLM_API_URL = "https://203.0.113.10/v1"; process.env.LLM_API_KEY = "fictitious-not-secret"; process.env.LLM_MODEL = "fixture-study"; process.env.LLM_ALLOW_DEMO = "0";
  globalThis.fetch = async (_url, init) => { remoteCalls++; receivedSignal = init?.signal || undefined; if (init?.signal?.aborted) throw init.signal.reason; return new Response(JSON.stringify({ choices: [{ message: { content: "fictitious study draft" } }] })); };
  try {
    const { askLlm, getLlmConfig, llmEndpointHash, selectLocalLlmProfile } = await import("@/lib/integrations/llm"); const config = await getLlmConfig();
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
    const profile = LOCAL_MODELS[1];
    await assert.rejects(selectLocalLlmProfile(profile.id, "fixture"), /permiso/);
    role = "admin";
    await selectLocalLlmProfile(profile.id, "fixture");
    const managed = await getLlmConfig();
    const managedDestination = { provider: managed.preset, model: managed.model, endpointHash: llmEndpointHash(managed) };
    role = "abogado";
    process.env.LLM_ALLOW_DEMO = "1";
    const { downloadLocalModel } = await import("@/lib/integrations/local-models");
    const visited: string[] = [];
    let cloudDisabled = false, installed = true, digest: string = profile.sha256, manifestValid = false, blockValid = false;
    const fixtureManifest = '{"schemaVersion":2,"mediaType":"application/vnd.docker.distribution.manifest.v2+json","config":{"mediaType":"application/vnd.docker.container.image.v1+json","digest":"sha256:b0830f4ff6a0220cfd995455206353b0ed23c0aee865218b154b7a75087b4e55","size":490},"layers":[{"mediaType":"application/vnd.ollama.image.model","digest":"sha256:7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa","size":522640096},{"mediaType":"application/vnd.ollama.image.template","digest":"sha256:ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4","size":1723},{"mediaType":"application/vnd.ollama.image.license","digest":"sha256:d18a5cc71b84bc4af394a31116bd3932b42241de70c77d2b76d69a314ec8aa12","size":11338},{"mediaType":"application/vnd.ollama.image.params","digest":"sha256:cff3f395ef3756ab63e58b0ad1b32bb6f802905cae1472e6a12034e4246fbbdb","size":120}]}';
    globalThis.fetch = async (url, init) => {
      const target = new URL(String(url));
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      visited.push(target.pathname);
      if (target.origin === "https://registry.ollama.ai") {
        assert.equal(init?.method, undefined);
        assert.equal(target.pathname, "/v2/library/qwen3/manifests/0.6b-q4_K_M");
        return new Response(manifestValid ? fixtureManifest : "{}");
      }
      assert.equal(target.origin, OLLAMA_LOCAL_ORIGIN);
      if (target.pathname === "/api/status") return Response.json({ cloud: { disabled: cloudDisabled } });
      if (target.pathname === "/api/tags") {
        return Response.json({ models: installed ? [{ name: profile.tag, digest, size: profile.bytes }] : [] });
      }
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, profile.tag);
      if (target.pathname === "/api/pull") {
        assert.deepEqual(body, { model: profile.tag, stream: true });
        if (blockValid) installed = true;
        const event = { status: "pulling blob", digest: "sha256:7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa", total: blockValid ? 522640096 : 3_000_000_001, completed: 1 };
        return new Response(JSON.stringify(event) + '\n{"status":"success"}\n');
      }
      assert.equal(target.pathname, "/api/chat");
      assert.equal(body.truncate, false);
      assert.equal(body.keep_alive, 0);
      assert.equal(body.think, false);
      assert.equal(body.options.num_ctx, 4096);
      assert.equal(body.options.num_predict, 768);
      assert.deepEqual(body.messages, input.messages);
      return Response.json({ done: true, message: { content: "Prueba local correcta." } });
    };
    assert.equal((await askLlm(input)).source, "error", "cloud availability must fail before sending prompt");
    assert.deepEqual(visited.splice(0), ["/api/status"]);
    cloudDisabled = true;
    assert.equal((await askLlm({ ...input, causaId: "fictitious-cause", expectedDestination: managedDestination })).content, "Prueba local correcta.");
    assert.deepEqual(caseActivity, ["Solicitud de IA completada para revisión."], "private response text never goes into shared case activity");
    assert.deepEqual(visited.splice(0), ["/api/status", "/api/tags", "/api/chat"]);
    const oversized = await askLlm({ ...input, messages: [{ role: "user", content: "x".repeat(12_001) }] });
    assert.equal(oversized.source, "error", "managed profile must reject, not truncate, the last user message");
    assert.deepEqual(visited, []);
    digest = "different";
    assert.equal((await askLlm(input)).source, "error", "changed local model must fail without demo");
    assert.deepEqual(visited.splice(0), ["/api/status", "/api/tags"]);
    await assert.rejects(downloadLocalModel(profile), /otra edición/);
    assert.deepEqual(visited.splice(0), ["/api/status", "/api/tags"]);
    digest = profile.sha256;
    installed = false;
    await assert.rejects(downloadLocalModel(profile), /edición publicada/);
    assert.deepEqual(visited.splice(0), ["/api/status", "/api/tags", "/v2/library/qwen3/manifests/0.6b-q4_K_M"]);
    manifestValid = true;
    await assert.rejects(downloadLocalModel(profile), /descarga verificada/);
    assert.equal(visited.pop(), "/api/pull");
    visited.length = 0;
    blockValid = true;
    await downloadLocalModel(profile);
    assert.equal(visited.pop(), "/api/tags");
    visited.length = 0;
    await downloadLocalModel(profile);
    assert.deepEqual(visited.splice(0), ["/api/status", "/api/tags"], "the verified install is idempotent");
    role = "admin";
    await selectLocalLlmProfile(null, "fixture");
    const restored = await getLlmConfig();
    assert.equal(restored.apiUrl, config.apiUrl);
    assert.equal(restored.apiKey, config.apiKey);
    assert.equal(restored.localProfile, undefined);
    process.env.LLM_API_URL = managed.apiUrl;
    process.env.LLM_MODEL = managed.model;
    const sameAddress = await getLlmConfig();
    assert.deepEqual([sameAddress.preset, sameAddress.apiUrl, sameAddress.model], [managed.preset, managed.apiUrl, managed.model]);
    assert.notEqual(llmEndpointHash(sameAddress), managedDestination.endpointHash);
    const staleManaged = await askLlm({ ...input, expectedDestination: managedDestination });
    assert.equal("code" in staleManaged && staleManaged.code, "llm_destination_changed");
    assert.deepEqual(visited, [], "an approval for the verified profile cannot fall through to the ordinary endpoint");
    console.log("Workbench LLM boundary: destination pinning, fail-closed routing and propagated cancellation passed with zero network.");
    console.log("Managed local AI: cloud lock, no credential forwarding, bounded generation and verified idempotent install passed with zero network.");
  } finally { globals.prisma = previous.db; globals.lexopenCodexSessions = previous.manager; globalThis.fetch = previous.fetch; for (const key of Object.keys(process.env)) if (!(key in previous.env)) delete process.env[key]; Object.assign(process.env, previous.env); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
