import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { saveWhatsAppConfig } from "../src/lib/notify/whatsapp-config";
import { loginAs, authenticateApiRequests } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
test("WhatsApp exige consentimiento, firma del webhook y permisos; vincula y revoca sin envíos reales", async ({ page }) => {
  test.setTimeout(90000); const tag = randomUUID(), secret = "fictional-whatsapp-auth-token", accountSid = "AC" + "1".repeat(32), callbackUrl = "https://example.invalid/api/notify/whatsapp/webhook/twilio", businessNumber = "+15555550100";
  let userId = "";
  const previous = await prisma.integrationConfig.findUnique({ where: { provider: "whatsapp" } });
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@whatsapp-browser.invalid`, name: "WhatsApp ficticio", role: "abogado", password: await hash("lexopen", 10) } }); userId = user.id;
    await saveWhatsAppConfig(true, { vendor: "twilio", businessNumber, callbackUrl, accountSid, contentSid: "HX" + "2".repeat(32), authToken: secret });
    await loginAs(page, user.email); await authenticateApiRequests(page);
    expect((await page.request.put("/api/integrations/notify", { data: { provider: "whatsapp", enabled: false } })).status()).toBe(403);
    expect((await page.request.post("/api/notify/whatsapp/link", { data: { consent: false } })).status()).toBe(400);
    const linked = await page.request.post("/api/notify/whatsapp/link", { data: { consent: true } }); expect(linked.status()).toBe(200); const link = await linked.json();
    const form = new URLSearchParams({ AccountSid: accountSid, To: "whatsapp:" + businessNumber, From: "whatsapp:+15555550101", Body: link.text });
    const signature = (params: URLSearchParams) => createHmac("sha1", secret).update(callbackUrl + [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + v).join("")).digest("base64");
    const webhook = "/api/notify/whatsapp/webhook/twilio";
    expect((await page.request.post(webhook, { headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "forged" }, data: form.toString() })).status()).toBe(403);
    expect(await prisma.canalUsuario.count({ where: { userId, canal: "whatsapp", estado: "activo" } })).toBe(0);
    expect((await page.request.post(webhook, { headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": signature(form) }, data: form.toString() })).status()).toBe(200);
    expect(await prisma.canalUsuario.count({ where: { userId, canal: "whatsapp", estado: "activo" } })).toBe(1);
    const preferences = await page.request.get("/api/notify/preferences"), state = await preferences.json();
    expect(state.matriz.every((row: { canales: { whatsapp: string } }) => row.canales.whatsapp === "off")).toBe(true);
    expect((await page.request.put("/api/notify/preferences", { data: { prefs: [{ tipo: "plazo.fatal", canal: "whatsapp", modo: "realtime" }] } })).status()).toBe(200);
    expect((await page.request.put("/api/notify/preferences", { data: { prefs: [{ tipo: "plazo.fatal", canal: "whatsapp", modo: "off" }] } })).status()).toBe(200);
    expect((await prisma.preferenciaNotificacion.findFirstOrThrow({ where: { userId, canal: "whatsapp", tipo: "plazo.fatal" } })).modo).toBe("off");
    // UI stays self-service: no admin/provider-health request, no send-test call.
    await page.goto("/cuenta/notificaciones"); await expect(page.getByRole("heading", { name: "Mi WhatsApp", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Revocar WhatsApp", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Revocar WhatsApp", exact: true }).click(); await expect(page.getByRole("button", { name: "Obtener código de vinculación", exact: true })).toBeVisible();
    expect(await prisma.canalUsuario.count({ where: { userId, canal: "whatsapp", estado: "activo" } })).toBe(0);
    expect(await prisma.mensajeSaliente.count({ where: { userId } })).toBe(0);
  } finally {
    if (userId) { await prisma.auditEvent.deleteMany({ where: { actorId: userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
    if (previous) await prisma.integrationConfig.upsert({ where: { provider: "whatsapp" }, create: previous, update: { enabled: previous.enabled, configJson: previous.configJson } }); else await prisma.integrationConfig.deleteMany({ where: { provider: "whatsapp" } });
  }
});

test("Meta verifica el challenge, la firma y el número receptor antes de consumir el código", async ({ page }) => {
  test.setTimeout(90000); const tag = randomUUID(), appSecret = "fictional-meta-app-secret", verifyToken = "fictional-meta-verification-token", phoneNumberId = "1234567890";
  let userId = ""; const previous = await prisma.integrationConfig.findUnique({ where: { provider: "whatsapp" } });
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@meta-browser.invalid`, name: "Meta ficticio", role: "abogado", password: await hash("lexopen", 10) } }); userId = user.id;
    await saveWhatsAppConfig(true, { vendor: "meta", businessNumber: "+15555550110", callbackUrl: "https://example.invalid/api/notify/whatsapp/webhook/meta", apiVersion: "v25.0", phoneNumberId, templateName: "lexopen_notice", language: "es", accessToken: "fictional-meta-access-token", appSecret, verifyToken });
    await loginAs(page, user.email); await authenticateApiRequests(page);
    const webhook = "/api/notify/whatsapp/webhook/meta", query = `?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=fixture-challenge`;
    expect((await page.request.get(webhook + query.replace(verifyToken, "forged"))).status()).toBe(403);
    const challenge = await page.request.get(webhook + query); expect(challenge.status()).toBe(200); expect(await challenge.text()).toBe("fixture-challenge");
    const link = await (await page.request.post("/api/notify/whatsapp/link", { data: { consent: true } })).json();
    const payload = (receiver: string, text: string) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: receiver }, messages: [{ id: "wamid.fixture", from: "15555550111", type: "text", text: { body: text } }] } }] }] });
    const signature = (body: string) => "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
    const send = (body: string, signed = true) => page.request.post(webhook, { headers: { "Content-Type": "application/json", "x-hub-signature-256": signed ? signature(body) : "forged" }, data: body });
    expect((await send(payload(phoneNumberId, link.text), false)).status()).toBe(403);
    expect((await send(payload("9999999999", link.text))).status()).toBe(200);
    expect(await prisma.canalUsuario.count({ where: { userId, estado: "activo" } })).toBe(0);
    expect((await send(payload(phoneNumberId, link.text))).status()).toBe(200);
    expect((await send(payload(phoneNumberId, link.text))).status()).toBe(200);
    expect(await prisma.canalUsuario.count({ where: { userId, estado: "activo" } })).toBe(1);
    expect((await send(payload(phoneNumberId, "STOP"))).status()).toBe(200);
    expect(await prisma.canalUsuario.count({ where: { userId, estado: "activo" } })).toBe(0);
    expect((await send("x".repeat(262145))).status()).toBe(413);
    expect(await prisma.mensajeSaliente.count({ where: { userId } })).toBe(0);
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (previous) await prisma.integrationConfig.upsert({ where: { provider: "whatsapp" }, create: previous, update: { enabled: previous.enabled, configJson: previous.configJson } }); else await prisma.integrationConfig.deleteMany({ where: { provider: "whatsapp" } });
  }
});
