import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWhatsAppProvider } from "./whatsapp";
import { verifyMetaSignature, verifyTwilioSignature } from "../whatsapp-link";
import type { WhatsAppConfig } from "../whatsapp-config";
const number = "+15555550100", dest = { kind: "whatsapp" as const, e164: number };
const config: WhatsAppConfig = { vendor: "meta", businessNumber: number, callbackUrl: "https://example.invalid/api/notify/whatsapp/webhook/meta", apiVersion: "v25.0", phoneNumberId: "1234567890", templateName: "lexopen_notice", language: "es", accessToken: "fictional-access-token", appSecret: "fictional-app-secret", verifyToken: "fictional-verification-token" };
async function main() {
  for (const vendor of ["meta", "twilio"] as const) {
    const cfg = { ...config, vendor, accountSid: "AC" + "1".repeat(32), authToken: "fictional-auth-token", contentSid: "HX" + "2".repeat(32) };
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = createWhatsAppProvider(cfg, async (url, init) => { calls.push({ url, init }); return Response.json(vendor === "meta" ? { messages: [{ id: "wamid.fixture" }] } : { sid: "SMfixture" }); });
    const result = await provider.send({ title: "Sensitive case name", text: "Private body", href: "/causas/private-id" }, dest);
    assert.equal(result.ok, true); assert.equal(calls.length, 1);
    assert.match(calls[0].url, vendor === "meta" ? /^https:\/\/graph.facebook.com\/v25.0\/1234567890\/messages$/ : /^https:\/\/api.twilio.com\/2010-04-01\/Accounts\/AC1+\/Messages.json$/);
    assert.doesNotMatch(String(calls[0].init.body), /Sensitive|Private|private-id/);
    if (vendor === "meta") assert.deepEqual(JSON.parse(String(calls[0].init.body)).template, { name: "lexopen_notice", language: { code: "es" } });
    else { const body = new URLSearchParams(String(calls[0].init.body)); assert.equal(body.get("From"), `whatsapp:${number}`); assert.equal(body.get("ContentSid"), cfg.contentSid); assert.equal(body.has("Body"), false); }
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const failing = createWhatsAppProvider(cfg, async () => Response.json({ error: { message: "secret-token private-number" } }, { status }));
      const outcome = await failing.send({ title: "x", text: "y" }, dest); assert.equal(outcome.ok, false);
      if (!outcome.ok) { assert.equal(outcome.retryable, status === 429); assert.equal(Boolean(outcome.uncertain), status >= 500); assert.doesNotMatch(outcome.error, /secret-token|private-number/); }
    }
    for (const transport of [async () => { throw Error("token must never escape"); }, async () => Response.json({})]) {
      const outcome = await createWhatsAppProvider(cfg, transport).send({ title: "x", text: "y" }, dest);
      assert.equal(outcome.ok, false); if (!outcome.ok) { assert.equal(outcome.uncertain, true); assert.doesNotMatch(outcome.error, /token must/); }
    }
    const before = calls.length;
    assert.equal((await provider.send({ title: "x", text: "y" }, { kind: "whatsapp", e164: "not-a-phone" })).ok, false);
    assert.equal(calls.length, before);
  }
  const raw = '{"fixture":true}', secret = "signature-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyMetaSignature(raw, signature, secret), true); assert.equal(verifyMetaSignature(raw + " ", signature, secret), false);
  const url = "https://example.invalid/api/notify/whatsapp/webhook/twilio";
  const params = new URLSearchParams({ From: "whatsapp:" + number, Body: "LEXOPEN abc" });
  const twilio = createHmac("sha1", secret).update(url + "BodyLEXOPEN abcFromwhatsapp:" + number).digest("base64");
  assert.equal(verifyTwilioSignature(url, params, twilio, secret), true);
  assert.equal(verifyTwilioSignature(url.replace("https:", "http:"), params, twilio, secret), false);
  params.append("From", "other"); assert.equal(verifyTwilioSignature(url, params, twilio, secret), false);
  console.log("WhatsApp contracts passed: Meta/Twilio approved templates, data minimization, rejection/retry/uncertain states, invalid destinations and signed webhooks.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
