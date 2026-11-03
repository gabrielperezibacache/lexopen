import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const base = path.resolve(process.env.CODEX_DATA_DIR || ""), executable = path.resolve("e2e/fixtures/codex-app-server.mjs");
if (path.resolve(process.env.CODEX_BIN || "") !== executable || !/^lexopen-codex-e2e(?:[-_][a-zA-Z0-9_-]+)?$/.test(path.basename(base))) throw new Error("Codex browser tests require CODEX_BIN=e2e/fixtures/codex-app-server.mjs and a dedicated CODEX_DATA_DIR named lexopen-codex-e2e.");
const tag = randomUUID(), ownerEmail = `codex-owner-${tag}@example.test`, peerEmail = `codex-peer-${tag}@example.test`;
const api = "/api/integrations/codex", actorIds: string[] = [];
let firm: { id: string; assistantLlmMode: string };
type State = { connection: { available: boolean; connected: boolean; account?: { email: string }; pendingLogin?: { verificationUrl: string; userCode: string } }; preference: { enabled: boolean; model: string }; remoteAllowed: boolean };
const homeFor = (actorId: string) => path.join(base, createHash("sha256").update(actorId).digest("hex"));
function safe(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("TEST_ONLY_ACCESS_TOKEN_NEVER_EXPOSE");
  expect(serialized).not.toMatch(/"(?:accessToken|refreshToken|apiKey|secret|home|CODEX_HOME)"\s*:/i);
}
async function json<T>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const value = await response.json(); safe(value); return value;
}
async function state(page: Page) { return json<State>(await page.request.get(api)); }
async function methods(actorId: string) {
  const content = await readFile(path.join(homeFor(actorId), "requests.jsonl"), "utf8").catch(() => "");
  return content.trim().split("\n").filter(Boolean).map(line => (JSON.parse(line) as { method: string }).method);
}
test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const [email, name] of [[ownerEmail, "Profesional ficticio con Codex"], [peerEmail, "Otra profesional ficticia"]]) actorIds.push((await db.user.create({ data: { email, name, role: "abogado", password: seed.password } })).id);
  firm = await db.firmSettings.findFirstOrThrow({ select: { id: true, assistantLlmMode: true } });
  await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });
});
test.afterAll(async () => {
  try {
    if (firm) await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: firm.assistantLlmMode } });
    if (actorIds.length) {
      await db.integrationConfig.deleteMany({ where: { provider: { in: actorIds.map(id => `codex:${id}`) } } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
      await db.user.deleteMany({ where: { id: { in: actorIds } } });
      for (const actorId of actorIds) await rm(homeFor(actorId), { recursive: true, force: true });
    }
  } finally { await db.$disconnect(); }
});

test("Codex personal: autorización explícita, modelos, prueba, aislamiento, política local y desconexión", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  await loginAs(page, ownerEmail);
  await page.goto("/cuenta#codex");
  const connection = page.locator("#codex");
  await expect(connection.getByRole("heading", { name: "Tu cuenta de Codex", exact: true })).toBeVisible();
  await expect(connection.getByText("Cuenta sin conectar", { exact: true })).toBeVisible();
  expect((await state(page)).connection.connected).toBe(false);
  await connection.getByRole("button", { name: "Conectar cuenta de ChatGPT/Codex", exact: true }).click();
  await expect(connection.getByLabel("Código de autorización", { exact: true })).toHaveText("DEMO-1234");
  await expect(connection.getByRole("link", { name: "Continuar en OpenAI", exact: false })).toHaveAttribute("href", "https://auth.openai.com/codex/device");
  const pending = await state(page);
  expect(pending.connection.connected).toBe(false);
  expect(pending.connection.pendingLogin?.userCode).toBe("DEMO-1234");
  async function capture(label: string) {
    for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
      await page.setViewportSize(viewport); await page.evaluate(() => document.fonts.ready);
      await connection.evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 100), behavior: "instant" }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: info.outputPath(`codex-${label}-${device}.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await capture("authorization");
  await connection.getByRole("button", { name: "Cancelar autorización", exact: true }).click();
  await expect(connection.getByLabel("Código de autorización", { exact: true })).toHaveCount(0);
  await connection.getByRole("button", { name: "Conectar cuenta de ChatGPT/Codex", exact: true }).click();
  await expect(connection.getByLabel("Código de autorización", { exact: true })).toHaveText("DEMO-1234");
  const home = homeFor(actorIds[0]);
  expect((await lstat(home)).isSymbolicLink()).toBe(false);
  await writeFile(path.join(home, "approval.json"), JSON.stringify({ approved: true }), { mode: 0o600 });
  await expect(connection.getByText("Cuenta conectada", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect((await state(page)).connection.account?.email).toBe(`codex-${path.basename(home).slice(0, 8)}@example.test`);
  const model = connection.getByRole("combobox", { name: "Modelo de tu conexión", exact: true });
  await expect(model).toHaveValue("codex-e2e");
  await connection.getByRole("checkbox", { name: "Usar mi Codex en las próximas solicitudes de IA", exact: true }).check();
  await connection.getByRole("button", { name: "Guardar preferencia", exact: true }).click();
  await expect(connection.getByText("Preferencia guardada.", { exact: false })).toBeVisible();
  expect((await state(page)).preference).toEqual({ enabled: true, model: "codex-e2e" });
  const stateRoute = (url: URL) => url.pathname === api;
  let failInitialState = true;
  await page.route(stateRoute, async route => {
    if (route.request().method() === "GET" && failInitialState) return route.fulfill({ status: 503, json: { error: "Servicio de conexión temporalmente no disponible." } });
    return route.continue();
  });
  try {
    await page.reload();
    await expect(connection.getByRole("alert")).toContainText("Servicio de conexión temporalmente no disponible.");
    // Keep failing both development mounts until the user explicitly retries.
    failInitialState = false;
    await connection.getByRole("button", { name: "Volver a consultar conexión", exact: true }).click();
    await expect(connection.getByRole("checkbox", { name: "Usar mi Codex en las próximas solicitudes de IA", exact: true })).toBeChecked();
    await expect(model).toHaveValue("codex-e2e");
    await expect(connection.getByText("Cuenta conectada", { exact: true })).toBeVisible();
  } finally { await page.unroute(stateRoute); }
  await connection.getByRole("button", { name: "Probar conexión", exact: true }).click();
  await expect(connection.getByText("Codex respondió con codex-e2e.", { exact: false })).toContainText("Conexión de LexOpen comprobada.");
  expect((await methods(actorIds[0])).filter(method => method === "turn/start")).toHaveLength(1);
  await capture("connected");
  const peerContext = await browser.newContext({ locale: "es-CL" }), peer = await peerContext.newPage();
  const portalContext = await browser.newContext({ locale: "es-CL" }), portal = await portalContext.newPage();
  try {
    await loginAs(peer, peerEmail);
    const independent = await state(peer);
    expect(independent.connection.connected).toBe(false);
    expect(independent.preference).toEqual({ enabled: false, model: "" });
    expect(independent.connection.account).toBeUndefined();
    const injected = await page.request.post(api, { data: { action: "connect", actorId: actorIds[1] } });
    expect(injected.status()).toBe(400);
    expect((await state(peer)).connection.pendingLogin).toBeUndefined();
    const bad = await page.request.post(api, { data: "{bad", headers: { "Content-Type": "application/json" } });
    expect(bad.status()).toBe(400);
    await loginAs(portal, "cliente@andes.cl");
    expect((await portal.request.get(api)).status()).toBe(403);
    expect((await portal.request.post(api, { data: { action: "connect" } })).status()).toBe(403);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "local_only" } });
    const before = (await methods(actorIds[0])).filter(method => ["account/login/start", "turn/start"].includes(method));
    for (const data of [{ action: "connect" }, { action: "save", enabled: true, model: "codex-e2e" }, { action: "test", model: "codex-e2e" }]) expect((await page.request.post(api, { data })).status()).toBe(403);
    const after = (await methods(actorIds[0])).filter(method => ["account/login/start", "turn/start"].includes(method));
    expect(after).toEqual(before);
    expect((await state(page)).remoteAllowed).toBe(false);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });
    await json(await peer.request.post(api, { data: { action: "disconnect" } }));
  } finally { await peerContext.close(); await portalContext.close(); }
  await connection.getByRole("button", { name: "Desconectar cuenta", exact: true }).click();
  await expect(connection.getByText("Cuenta sin conectar", { exact: true })).toBeVisible();
  const disconnected = await state(page);
  expect(disconnected.connection.connected).toBe(false);
  expect(disconnected.preference.enabled).toBe(false);
});
