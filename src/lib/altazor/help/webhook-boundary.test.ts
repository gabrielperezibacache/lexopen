import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { encryptSecret } from "@/lib/notify/secrets";

async function main() {
  Object.assign(globalThis, { AsyncLocalStorage });
  const previous = { NODE_ENV: process.env.NODE_ENV, LEXOPEN_OPEN_ACCESS: process.env.LEXOPEN_OPEN_ACCESS, LEXOPEN_SECRETS_KEY: process.env.LEXOPEN_SECRETS_KEY, DATABASE_URL: process.env.DATABASE_URL };
  Object.assign(process.env, { NODE_ENV: "production", LEXOPEN_OPEN_ACCESS: "0", LEXOPEN_SECRETS_KEY: "fictitious-webhook-boundary-test-key", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/webhook_unit_test" });
  try {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    for (const method of ["GET", "POST"]) {
      const allowed = await proxy(new NextRequest("https://lexopen.example/api/altazor/help/whatsapp", { method }));
      assert.equal(allowed.headers.get("x-middleware-next"), "1");
    }
    for (const [path, method] of [["/api/altazor/help", "GET"], ["/api/altazor/help/providers", "GET"], ["/api/altazor/help/reconcile", "POST"], ["/api/altazor/help/whatsapp/child", "POST"], ["/api/altazor/help/whatsapp", "PUT"]]) {
      const protectedResponse = await proxy(new NextRequest(`https://lexopen.example${path}`, { method }));
      assert.equal(protectedResponse.status, 401, `${method} ${path} never inherits the webhook exemption`);
    }
    const { prisma } = await import("@/lib/db");
    const credentials = { phoneNumberId: "1234567890", apiVersion: "v23.0", templateName: "altazor_help", templateLanguage: "es", accessToken: "fictitious-meta-access", appSecret: "fictitious-meta-signature-secret", verifyToken: "fictitious-meta-verification-token-24" };
    let fixtures = true;
    prisma.$use(async (params, next) => {
      if (fixtures && params.model === "IntegrationConfig" && params.action === "findUnique" && params.args.where.provider === "whatsapp_meta") return { enabled: true, configJson: JSON.stringify({ secret: encryptSecret(JSON.stringify(credentials)) }) };
      return next(params);
    });
    try {
      const handlers = await import("@/app/api/altazor/help/whatsapp/route");
      let response = await handlers.GET(new Request("https://lexopen.example/api/altazor/help/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge"));
      assert.equal(response.status, 403);
      response = await handlers.GET(new Request(`https://lexopen.example/api/altazor/help/whatsapp?hub.mode=subscribe&hub.verify_token=${credentials.verifyToken}&hub.challenge=challenge`));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "challenge");
      response = await handlers.POST(new Request("https://lexopen.example/api/altazor/help/whatsapp", { method: "POST", body: "{}", headers: { "x-hub-signature-256": "sha256=invalid" } }));
      assert.equal(response.status, 401, "proxy bypass does not bypass Meta signature verification");
      const body = "{}", signature = `sha256=${createHmac("sha256", credentials.appSecret).update(body).digest("hex")}`;
      response = await handlers.POST(new Request("https://lexopen.example/api/altazor/help/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signature } }));
      assert.equal(response.status, 200);
      response = await handlers.POST(new Request("https://lexopen.example/api/altazor/help/whatsapp", { method: "POST", body: body + " ", headers: { "x-hub-signature-256": signature } }));
      assert.equal(response.status, 401, "signatures bind the exact raw body");
    } finally { fixtures = false; }
    console.log("Help webhook boundary passed: exact GET/POST proxy exemption, protected siblings, verified challenge and raw-body HMAC rejection; no database or network.");
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
