import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { createWebPushProvider, generateVapidKeys, isAllowedPushEndpoint } from "./webpush";

async function main() {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/fixture", "https://updates.push.services.mozilla.com/wpush/v2/fixture", "https://web.push.apple.com/fixture"]) assert.equal(isAllowedPushEndpoint(endpoint), true);
  for (const endpoint of ["http://fcm.googleapis.com/fixture", "https://127.0.0.1/", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.example/", "https://arbitrary.example/", "https://user:pass@fcm.googleapis.com/", "https://fcm.googleapis.com:444/"]) assert.equal(isAllowedPushEndpoint(endpoint), false);
  const vapid = generateVapidKeys(), ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const dest = { kind: "push" as const, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } } };
  const provider = createWebPushProvider({ ...vapid, subject: "mailto:fixture@example.invalid" });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async (input, init) => {
      calls += 1;
      assert.equal(String(input), dest.subscription.endpoint);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "POST");
      assert.ok(init?.signal);
      assert.ok(init?.body instanceof ArrayBuffer);
      assert.ok(!Buffer.from(init.body as ArrayBuffer).toString("utf8").includes("fixture confidential text"));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    assert.equal((await provider.send({ title: "Fixture", text: "fixture confidential text" }, dest, { dedupeKey: "fixture-id" })).ok, true);
    const invalid = await provider.send({ title: "Fixture", text: "Fixture" }, { ...dest, subscription: { ...dest.subscription, endpoint: "https://127.0.0.1/" } });
    assert.equal(invalid.ok, false); assert.equal(calls, 1, "invalid endpoint cannot reach transport");
    globalThis.fetch = (async () => new Response(null, { status: 410 })) as typeof fetch;
    const expired = await provider.send({ title: "Fixture", text: "Fixture" }, dest);
    assert.equal(expired.ok, false);
    if (!expired.ok) { assert.equal(expired.blockDestination, true); assert.equal(expired.retryable, false); }
  } finally { globalThis.fetch = originalFetch; }
  console.log("notify/providers/webpush.test.ts OK: allowlist, encrypted payload, safe transport, expired destination");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
