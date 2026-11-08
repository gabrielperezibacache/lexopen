/** In-memory Ollama/registry responses; no model weights or local daemon are accessed. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localModelProfile, OLLAMA_LOCAL_ORIGIN } from "./local-model-profiles";

test("larger pinned models download through the verified boundary and use family-specific thinking controls", async () => {
  const previousFetch = globalThis.fetch;
  const manifest = (await readFile(new URL("./fixtures/qwen35-9b-manifest.json", import.meta.url), "utf8")).trimEnd();
  const parsed = JSON.parse(manifest);
  const modelLayer = parsed.layers.find((layer: { mediaType: string }) => layer.mediaType === "application/vnd.ollama.image.model");
  assert.ok(modelLayer.size > 3_000_000_000);
  let profile = localModelProfile("qwen35-9b")!;
  let installed = false, changedManifest = false, wrongBlock = false;
  const chats: Record<string, unknown>[] = [];
  const pulls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    if (target.origin === "https://registry.ollama.ai") {
      assert.equal(target.pathname, "/v2/library/qwen3.5/manifests/9b-q4_K_M");
      return new Response(changedManifest ? manifest + " " : manifest);
    }
    assert.equal(target.origin, OLLAMA_LOCAL_ORIGIN);
    if (target.pathname === "/api/status") return Response.json({ cloud: { disabled: true } });
    if (target.pathname === "/api/tags") return Response.json({ models: installed ? [{ name: profile.tag, size: profile.bytes, digest: profile.sha256 }] : [] });
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, profile.tag);
    if (target.pathname === "/api/pull") {
      pulls.push(body.model);
      installed = !wrongBlock;
      return new Response(JSON.stringify({ status: "pulling", digest: modelLayer.digest, total: modelLayer.size + (wrongBlock ? 1 : 0), completed: 1 }) + '\n{"status":"success"}\n');
    }
    assert.equal(target.pathname, "/api/chat");
    chats.push(body);
    return Response.json({ done: true, message: { content: "listo", thinking: "private fixture" } });
  };
  try {
    const { downloadLocalModel, completeLocalModel } = await import("./local-models");
    changedManifest = true;
    await assert.rejects(downloadLocalModel(profile), /edición publicada/);
    assert.deepEqual(pulls, []);
    changedManifest = false; wrongBlock = true;
    await assert.rejects(downloadLocalModel(profile), /descarga verificada/);
    wrongBlock = false;
    await downloadLocalModel(profile);
    const result = await completeLocalModel(profile, [{ role: "user", content: "Texto ficticio" }]);
    assert.equal(result, "listo");
    assert.equal(chats.at(-1)?.think, false);
    assert.deepEqual(chats.at(-1)?.options, { num_ctx: 4096, num_predict: 768, temperature: .2 });
    profile = localModelProfile("gpt-oss-20b")!;
    assert.equal(await completeLocalModel(profile, [{ role: "user", content: "Texto ficticio" }]), "listo");
    assert.equal(chats.at(-1)?.think, "low");
    assert.deepEqual(chats.at(-1)?.options, { num_ctx: 4096, num_predict: 2048, temperature: .2 });
    profile = localModelProfile("phi4-mini")!;
    await completeLocalModel(profile, [{ role: "user", content: "Texto ficticio" }]);
    assert.equal("think" in chats.at(-1)!, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
