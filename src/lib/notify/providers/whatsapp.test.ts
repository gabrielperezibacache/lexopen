import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createWhatsAppProvider, createWhatsAppMetaProvider, verifyWhatsAppSignature, parseWhatsAppInbound } from "./whatsapp";
import type { fetchSafeOutbound } from "@/lib/net/safe-url";
import { prisma } from "@/lib/db";
import { encryptSecret } from "../secrets";
import { getProvider } from "./registry";
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
  await helpContracts();
  await registryScopes();
  console.log("WhatsApp contracts passed: Meta/Twilio approved templates, data minimization, rejection/retry/uncertain states, invalid destinations and signed webhooks.");
}
async function helpContracts() {
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

  assert.deepEqual(parseWhatsAppInbound({ object: "whatsapp_business_account", entry: [null, { changes: [null, { value: { messages: [null] } }] }] }), []);
  const cfg = { phoneNumberId: "1234567890", accessToken: "fixture-access-token", appSecret: "fixture-app-secret", verifyToken: "fixture-verify-token", apiVersion: "v23.0", templateName: "altazor_help", templateLanguage: "es" };
  for (const transport of [async () => Response.json({}), async () => { throw Error("private provider details"); }]) {
    const result = await createWhatsAppMetaProvider(cfg, transport).send({ title: "Altazor", text: "ALTAZOR nonce answer" }, dest);
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.uncertain, true); assert.doesNotMatch(result.error, /private provider details/); }
  }
}
async function registryScopes() {
  // Middleware is a database-free fixture. Any unexpected query fails closed.
  const previous = process.env.LEXOPEN_SECRETS_KEY;
  process.env.LEXOPEN_SECRETS_KEY = "fictitious-whatsapp-registry-test-key";
  let enabled = true, generalConfig = config;
  const queried: string[] = [];
  prisma.$use(async params => {
    assert.equal(params.model, "IntegrationConfig"); assert.equal(params.action, "findUnique");
    const key = params.args.where.provider; queried.push(key);
    assert.equal(key, "whatsapp", "generic outbox must never load the Altazor help provider config");
    return { enabled, configJson: JSON.stringify({ ...generalConfig, accessToken: encryptSecret(config.accessToken!), authToken: encryptSecret("fictional-auth-token"), appSecret: encryptSecret(config.appSecret!), verifyToken: encryptSecret(config.verifyToken!) }) };
  });
  try {
    assert.equal((await getProvider("whatsapp"))?.id, "whatsapp_meta");
    assert.equal((await getProvider("whatsapp_meta"))?.id, "whatsapp_meta");
    assert.equal(await getProvider("whatsapp_twilio"), null);
    enabled = false;
    assert.equal(await getProvider("whatsapp"), null);
    assert.equal(await getProvider("whatsapp_meta"), null);
    enabled = true;
    generalConfig = { vendor: "twilio", businessNumber: number, callbackUrl: "https://example.invalid/api/notify/whatsapp/webhook/twilio", accountSid: "AC" + "1".repeat(32), contentSid: "HX" + "2".repeat(32), authToken: "fictional-auth-token" };
    assert.equal((await getProvider("whatsapp"))?.id, "whatsapp_twilio");
    assert.equal((await getProvider("whatsapp_twilio"))?.id, "whatsapp_twilio");
    assert.equal(await getProvider("whatsapp_meta"), null, "no fallback to a separate help template when the general vendor is Twilio");
    assert.ok(queried.length >= 8);
  } finally {
    if (previous === undefined) delete process.env.LEXOPEN_SECRETS_KEY; else process.env.LEXOPEN_SECRETS_KEY = previous;
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
