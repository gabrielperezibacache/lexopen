import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createWhatsAppMetaStub,
  createWhatsAppTwilioStub,
  WHATSAPP_NOT_IMPLEMENTED,
  createWhatsAppMetaProvider,
  verifyWhatsAppSignature,
  parseWhatsAppInbound,
} from "./whatsapp";
import type { fetchSafeOutbound } from "@/lib/net/safe-url";

async function main() {
  const meta = createWhatsAppMetaStub();
  const twilio = createWhatsAppTwilioStub();
  assert.equal(meta.id, "whatsapp_meta");
  assert.equal(twilio.id, "whatsapp_twilio");

  const health = await meta.health();
  assert.equal(health.ok, false);
  assert.match(health.detail || "", /adaptador legado/);

  const send = await meta.send(
    { title: "x", text: "y" },
    { kind: "whatsapp", e164: "+56911111111" }
  );
  assert.equal(send.ok, false);
  if (!send.ok) assert.equal(send.error, WHATSAPP_NOT_IMPLEMENTED);

  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "1234567890" }, messages: [{ id: "wamid.fixture", from: "56911111111", type: "text", timestamp: "1700000000", text: { body: "Reply" }, context: { id: "wamid.original" } }] } }] }] });
  const signature = `sha256=${createHmac("sha256", "fixture-app-secret").update(raw).digest("hex")}`;
  assert.equal(verifyWhatsAppSignature(raw, signature, "fixture-app-secret"), true);
  assert.equal(verifyWhatsAppSignature(raw + " ", signature, "fixture-app-secret"), false);
  assert.equal(verifyWhatsAppSignature(raw, null, "fixture-app-secret"), false);
  assert.deepEqual(parseWhatsAppInbound(JSON.parse(raw)), [{ id: "wamid.fixture", from: "56911111111", text: "Reply", timestamp: 1700000000, contextId: "wamid.original", phoneNumberId: "1234567890" }]);
  let calls = 0;
  const provider = createWhatsAppMetaProvider({ phoneNumberId: "1234567890", accessToken: "fixture-access-token", appSecret: "fixture-app-secret", verifyToken: "fixture-verify-token", apiVersion: "v23.0", templateName: "altazor_help", templateLanguage: "es" }, (async (url, init) => {
    calls++;
    assert.equal(url, "https://graph.facebook.com/v23.0/1234567890/messages");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-access-token");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, "56911111111");
    assert.equal(body.type, "template");
    assert.equal(body.template.components[0].parameters[0].text, "Minimal help notification");
    return Response.json({ messages: [{ id: "wamid.sent" }] });
  }) as typeof fetchSafeOutbound);
  assert.equal((await provider.health()).ok, true);
  assert.deepEqual(await provider.send({ title: "Altazor", text: "Minimal help notification" }, { kind: "whatsapp", e164: "+56911111111" }), { ok: true, providerMessageId: "wamid.sent" });
  assert.equal(calls, 1);

  console.log("notify/providers/whatsapp.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
