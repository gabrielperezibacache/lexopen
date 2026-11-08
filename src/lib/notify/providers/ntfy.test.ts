import assert from "node:assert/strict";
import { ntfyBaseUrl, pollNtfy, publishNtfy, validNtfyTopic } from "./ntfy";
import type { fetchSafeOutbound } from "@/lib/net/safe-url";

async function main() {
  const config = { baseUrl: "https://ntfy.example", topic: "private_notice_fixture", replyTopic: "private_replies_fixture", token: "fixture-token-not-a-credential" };
  assert.equal(ntfyBaseUrl(config.baseUrl), config.baseUrl);
  for (const url of ["http://ntfy.example", "https://127.0.0.1", "https://user:pass@ntfy.example", "https://ntfy.example/path", "https://ntfy.example/?token=secret"]) assert.throws(() => ntfyBaseUrl(url));
  assert.equal(validNtfyTopic("short"), false);
  let sends = 0;
  const http = (async (url, init) => {
    sends++;
    assert.equal(url, "https://ntfy.example/");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${config.token}`);
    const value = JSON.parse(String(init?.body));
    assert.equal(value.topic, config.topic);
    assert.equal(value.message, "Minimal notification");
    assert.equal(String(url).includes(config.token), false);
    return Response.json({ id: "notification-id" });
  }) as typeof fetchSafeOutbound;
  assert.deepEqual(await publishNtfy(config, { title: "Altazor", body: "Minimal notification" }, http), { ok: true, providerMessageId: "notification-id" });
  assert.equal(sends, 1);
  const responses = await pollNtfy(config, new Date(1_700_000_000_000), (async (url, init) => {
    assert.equal(url, "https://ntfy.example/private_replies_fixture/json?poll=1&since=1700000000");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${config.token}`);
    return new Response([
      "null",
      JSON.stringify({ event: "open", topic: config.replyTopic, id: "ignore", time: 1 }),
      JSON.stringify({ event: "message", topic: "other", id: "ignore", time: 1, message: "wrong" }),
      JSON.stringify({ event: "message", topic: config.replyTopic, id: "reply-id", time: 1_700_000_001, message: "ALTAZOR code answer" }),
    ].join("\n"));
  }) as typeof fetchSafeOutbound);
  assert.deepEqual(responses, [{ id: "reply-id", time: 1_700_000_001, message: "ALTAZOR code answer" }]);
  await assert.rejects(pollNtfy(config, new Date(), (async () => new Response("x".repeat(300_000))) as typeof fetchSafeOutbound), /tamaño/);
  const uncertain = await publishNtfy(config, { title: "Altazor", body: "Minimal" }, (async () => { throw Error("fixture token must not leak"); }) as typeof fetchSafeOutbound);
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) { assert.equal(uncertain.uncertain, true); assert.equal(uncertain.error.includes(config.token), false); }
  console.log("ntfy provider passed: HTTPS/SSRF, authenticated minimal publish/poll, bounded replies, uncertain delivery and no credential in URL/errors; no real network.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
