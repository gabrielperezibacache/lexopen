import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { apiRequest, loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const base = path.resolve(process.env.CODEX_DATA_DIR || ""), executable = path.resolve("e2e/fixtures/codex-app-server.mjs");
if (path.resolve(process.env.CODEX_BIN || "") !== executable || !/^lexopen-codex-e2e(?:[-_][a-zA-Z0-9_-]+)?$/.test(path.basename(base))) throw new Error("Codex browser tests require CODEX_BIN=e2e/fixtures/codex-app-server.mjs and a dedicated CODEX_DATA_DIR named lexopen-codex-e2e.");
const tag = randomUUID(), ownerEmail = `codex-owner-${tag}@example.test`, peerEmail = `codex-peer-${tag}@example.test`, hostUserEmail = `codex-host-user-${tag}@example.test`, adminEmail = `codex-admin-${tag}@example.test`;
const api = "/api/integrations/codex", adminApi = "/api/admin/codex", actorIds: string[] = [];
let firm: { id: string; assistantLlmMode: string };
type Connection = { available: boolean; connected: boolean; account?: { email: string }; pendingLogin?: { verificationUrl: string; userCode: string } };
type State = { connection: Connection; preference: { enabled: boolean; model: string; source: "personal" | "host"; revision: string }; host: { enabled: boolean; available: boolean; connected: boolean }; remoteAllowed: boolean };
type HostState = { connectionHost: Connection; policy: { enabled: boolean; revision: string }; remoteAllowed: boolean };
let previousHostPolicy: { id: string; provider: string; enabled: boolean; configJson: string; updatedAt: Date } | null;
const homeFor = (actorId: string) => path.join(base, createHash("sha256").update(actorId).digest("hex"));
const hostHome = path.join(base, "host", createHash("sha256").update("lexopen_host").digest("hex"));
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
async function methods(actorId: string) { return methodsAt(homeFor(actorId)); }
async function methodsAt(home: string) {
  const content = await readFile(path.join(home, "requests.jsonl"), "utf8").catch(() => "");
  return content.trim().split("\n").filter(Boolean).map(line => (JSON.parse(line) as { method: string }).method);
}
test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const [email, name, role] of [[ownerEmail, "Profesional ficticio con Codex", "abogado"], [peerEmail, "Otra profesional ficticia", "abogado"], [hostUserEmail, "Profesional con Codex del Host", "abogado"], [adminEmail, "Administrador ficticio del Host", "admin"]]) actorIds.push((await db.user.create({ data: { email, name, role, password: seed.password } })).id);
  previousHostPolicy = await db.integrationConfig.findUnique({ where: { provider: "codex-host" } });
  await db.integrationConfig.deleteMany({ where: { provider: "codex-host" } });
  await rm(hostHome, { recursive: true, force: true });
  firm = await db.firmSettings.findFirstOrThrow({ select: { id: true, assistantLlmMode: true } });
  await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });
});
test.afterAll(async () => {
  try {
    if (firm) await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: firm.assistantLlmMode } });
    await db.integrationConfig.deleteMany({ where: { provider: "codex-host" } });
    if (previousHostPolicy) await db.integrationConfig.create({ data: previousHostPolicy });
    await rm(hostHome, { recursive: true, force: true });
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
  await expect(connection.getByRole("heading", { name: "Tu conexión de Codex", exact: true })).toBeVisible();
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
  const model = connection.getByRole("combobox", { name: "Modelo de la fuente elegida", exact: true });
  await expect(model).toHaveValue("codex-e2e");
  await connection.getByRole("checkbox", { name: "Usar Codex personal en las próximas solicitudes de IA", exact: true }).check();
  await connection.getByRole("button", { name: "Guardar preferencia", exact: true }).click();
  await expect(connection.getByText("Preferencia guardada.", { exact: false })).toBeVisible();
  expect((await state(page)).preference).toMatchObject({ enabled: true, model: "codex-e2e", source: "personal" });
  expect((await state(page)).preference.revision).toMatch(/^[a-f0-9-]{36}$/);
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
    await expect(connection.getByRole("checkbox", { name: "Usar Codex personal en las próximas solicitudes de IA", exact: true })).toBeChecked();
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
    expect(independent.preference).toEqual({ enabled: false, model: "", source: "personal", revision: "legacy" });
    expect(independent.connection.account).toBeUndefined();
    const injected = await apiRequest(page).post(api, { data: { action: "connect", actorId: actorIds[1] } });
    expect(injected.status()).toBe(400);
    expect((await state(peer)).connection.pendingLogin).toBeUndefined();
    const bad = await apiRequest(page).post(api, { data: "{bad", headers: { "Content-Type": "application/json" } });
    expect(bad.status()).toBe(400);
    await loginAs(portal, "cliente@andes.cl");
    expect((await portal.request.get(api)).status()).toBe(403);
    expect((await apiRequest(portal).post(api, { data: { action: "connect" } })).status()).toBe(403);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "local_only" } });
    const before = (await methods(actorIds[0])).filter(method => ["account/login/start", "turn/start"].includes(method));
    for (const data of [{ action: "connect" }, { action: "save", enabled: true, model: "codex-e2e" }, { action: "test", model: "codex-e2e" }]) expect((await apiRequest(page).post(api, { data })).status()).toBe(403);
    const after = (await methods(actorIds[0])).filter(method => ["account/login/start", "turn/start"].includes(method));
    expect(after).toEqual(before);
    expect((await state(page)).remoteAllowed).toBe(false);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });
    await json(await apiRequest(peer).post(api, { data: { action: "disconnect" } }));
  } finally { await peerContext.close(); await portalContext.close(); }
  await connection.getByRole("button", { name: "Desconectar cuenta personal", exact: true }).click();
  await expect(connection.getByText("Cuenta sin conectar", { exact: true })).toBeVisible();
  const disconnected = await state(page);
  expect(disconnected.connection.connected).toBe(false);
  expect(disconnected.preference.enabled).toBe(false);
});

test("Codex del Host: autorización de administrador, elección explícita, fuentes aisladas y revocación sin cambio automático", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const adminContext = await browser.newContext({ locale: "es-CL" }), admin = await adminContext.newPage();
  const peerContext = await browser.newContext({ locale: "es-CL" }), peer = await peerContext.newPage();
  await loginAs(page, hostUserEmail);
  await page.goto("/cuenta#codex");
  const connection = page.locator("#codex"), source = connection.getByRole("combobox", { name: "Fuente de Codex", exact: true });
  const model = connection.getByRole("combobox", { name: "Modelo de la fuente elegida", exact: true });
  const hostChoice = connection.getByRole("checkbox", { name: "Usar Codex del Host en las próximas solicitudes de IA", exact: true });
  try {
    await expect(source).toHaveValue("personal");
    await expect(source.locator('option[value="host"]')).toHaveCount(0);
    expect((await state(page)).preference.enabled).toBe(false);
    expect((await apiRequest(page).post(api, { data: { action: "models", source: "host" } })).status()).toBe(403);
    expect((await page.request.get(adminApi)).status()).toBe(403);
    expect((await apiRequest(page).post(adminApi, { data: { action: "connect" } })).status()).toBe(403);
    await page.goto("/configuracion#llm-settings");
    await expect(page.locator("#host-codex")).toHaveCount(0);
    await page.goto("/cuenta#codex");

    await loginAs(admin, adminEmail);
    await admin.goto("/configuracion#llm-settings");
    const hostPanel = admin.locator("#host-codex");
    const sharing = hostPanel.getByRole("checkbox", { name: "Permitir que los usuarios elijan Codex del Host", exact: true });
    await expect(hostPanel.getByRole("heading", { name: "Codex del Host", exact: true })).toBeVisible();
    await expect(sharing).not.toBeChecked();
    await expect(sharing).toBeDisabled();
    const initialHost = await json<HostState>(await admin.request.get(adminApi));
    expect(initialHost.policy.enabled).toBe(false);
    expect(initialHost.connectionHost.connected).toBe(false);
    expect((await apiRequest(admin).post(adminApi, { data: { action: "save", enabled: true } })).status()).toBe(409);
    await hostPanel.getByRole("button", { name: "Conectar cuenta de Codex del Host", exact: true }).click();
    await expect(hostPanel.getByLabel("Código de autorización del Host", { exact: true })).toHaveText("DEMO-1234");
    const pending = await state(page);
    expect(pending.host).toEqual({ enabled: false, available: false, connected: false });
    expect(JSON.stringify(pending.host)).not.toContain("DEMO-1234");
    expect(pending.connection.pendingLogin).toBeUndefined();
    expect((await json<HostState>(await admin.request.get(adminApi))).connectionHost.pendingLogin?.userCode).toBe("DEMO-1234");
    expect((await lstat(hostHome)).isSymbolicLink()).toBe(false);
    await writeFile(path.join(hostHome, "approval.json"), JSON.stringify({ approved: true }), { mode: 0o600 });
    await expect(hostPanel.getByText("Cuenta conectada", { exact: true })).toBeVisible({ timeout: 15_000 });
    const hostEmail = `codex-${path.basename(hostHome).slice(0, 8)}@example.test`;
    await expect(hostPanel.getByText(hostEmail, { exact: true })).toBeVisible();
    const hostModel = hostPanel.getByRole("combobox", { name: "Modelo para probar la cuenta del Host", exact: true });
    await expect(hostModel).toHaveValue("codex-e2e");
    await hostPanel.getByRole("button", { name: "Probar conexión", exact: true }).click();
    await expect(hostPanel.getByText("Codex respondió con codex-e2e.", { exact: false })).toContainText("Conexión de LexOpen comprobada.");
    expect((await methodsAt(hostHome)).filter(method => method === "turn/start")).toHaveLength(1);
    expect((await json<HostState>(await admin.request.get(adminApi))).policy.enabled).toBe(false);
    await sharing.check();
    await hostPanel.getByRole("button", { name: "Guardar disponibilidad del Host", exact: true }).click();
    await expect(hostPanel.getByText("Disponibilidad de Codex del Host guardada.", { exact: true })).toBeVisible();
    const shared = await json<HostState>(await admin.request.get(adminApi));
    expect(shared.policy.enabled).toBe(true);
    expect(shared.policy.revision).toMatch(/^[a-f0-9-]{36}$/);

    await page.reload();
    await expect(source).toHaveValue("personal");
    await expect(source.locator('option[value="host"]')).toHaveCount(1);
    await expect(connection.getByRole("checkbox", { name: "Usar Codex personal en las próximas solicitudes de IA", exact: true })).not.toBeChecked();
    expect((await state(page)).preference.enabled).toBe(false);
    await source.selectOption("host");
    await expect(connection.getByText("Codex del Host disponible", { exact: true })).toBeVisible();
    await expect(model).toHaveValue("codex-e2e");
    await expect(connection.getByRole("button", { name: "Conectar cuenta de ChatGPT/Codex", exact: true })).toHaveCount(0);
    await expect(connection.getByRole("button", { name: /Desconectar cuenta/ })).toHaveCount(0);
    await expect(connection.getByText(hostEmail, { exact: true })).toHaveCount(0);
    await expect(connection.getByLabel("Código de autorización del Host", { exact: true })).toHaveCount(0);
    await expect(hostChoice).not.toBeChecked();
    await hostChoice.check();
    await connection.getByRole("button", { name: "Guardar preferencia", exact: true }).click();
    await expect(connection.getByText("Preferencia guardada.", { exact: false })).toBeVisible();
    const selected = await state(page);
    expect(selected.preference).toMatchObject({ source: "host", enabled: true, model: "codex-e2e" });
    expect(selected.connection.connected).toBe(false);
    expect(selected.connection.account).toBeUndefined();
    expect(selected.host).toEqual({ enabled: true, available: true, connected: true });
    expect(JSON.stringify(selected)).not.toContain(hostEmail);
    await connection.getByRole("button", { name: "Probar conexión", exact: true }).click();
    await expect(connection.getByText("Codex respondió con codex-e2e.", { exact: false })).toContainText("Conexión de LexOpen comprobada.");
    expect((await methodsAt(hostHome)).filter(method => method === "turn/start")).toHaveLength(2);
    expect((await methods(actorIds[2])).filter(method => method === "turn/start")).toHaveLength(0);

    for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
      await page.setViewportSize(viewport); await page.evaluate(() => document.fonts.ready);
      await connection.evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 100), behavior: "instant" }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: info.outputPath(`codex-host-selected-${device}.png`), animations: "disabled" });
      await admin.setViewportSize(viewport); await admin.evaluate(() => document.fonts.ready);
      await hostPanel.evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 100), behavior: "instant" }));
      expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await admin.screenshot({ path: info.outputPath(`codex-host-admin-${device}.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await admin.setViewportSize({ width: 1440, height: 1000 });

    // A personal account can coexist with a saved Host choice without replacing it.
    await source.selectOption("personal");
    await connection.getByRole("button", { name: "Conectar cuenta de ChatGPT/Codex", exact: true }).click();
    await expect(connection.getByLabel("Código de autorización", { exact: true })).toHaveText("DEMO-1234");
    await writeFile(path.join(homeFor(actorIds[2]), "approval.json"), JSON.stringify({ approved: true }), { mode: 0o600 });
    await expect(connection.getByText("Cuenta conectada", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(model).toHaveValue("codex-e2e");
    expect((await state(page)).preference.source).toBe("host");

    let releaseCatalog!: () => void, catalogArrived!: () => void, catalogFinished!: () => void;
    const released = new Promise<void>(resolve => { releaseCatalog = resolve; });
    const arrived = new Promise<void>(resolve => { catalogArrived = resolve; });
    const finished = new Promise<void>(resolve => { catalogFinished = resolve; });
    const routeMatch = (url: URL) => url.pathname === api;
    await page.route(routeMatch, async route => {
      const request = route.request();
      if (request.method() === "POST" && request.postDataJSON()?.action === "models" && request.postDataJSON()?.source === "personal") {
        catalogArrived(); await released;
        await route.fulfill({ json: { models: [{ id: "stale-personal-model", displayName: "Modelo personal atrasado", isDefault: true }] } }).catch(() => undefined);
        catalogFinished();
        return;
      }
      await route.continue();
    });
    try {
      await connection.getByRole("button", { name: "Actualizar modelos", exact: true }).click();
      await arrived;
      await source.selectOption("host");
      await expect(model).toHaveValue("codex-e2e");
      releaseCatalog();
      await finished;
      await expect(model.locator('option[value="stale-personal-model"]')).toHaveCount(0);
    } finally { releaseCatalog(); await page.unroute(routeMatch); }
    const beforeDisconnect = await state(page);
    await json(await apiRequest(page).post(api, { data: { action: "disconnect" } }));
    const personalDisconnected = await state(page);
    expect(personalDisconnected.connection.connected).toBe(false);
    expect(personalDisconnected.preference).toMatchObject({ enabled: true, source: "host", model: "codex-e2e" });
    expect(personalDisconnected.preference.revision).not.toBe(beforeDisconnect.preference.revision);
    expect(personalDisconnected.host.connected).toBe(true);

    await sharing.uncheck();
    await hostPanel.getByRole("button", { name: "Guardar disponibilidad del Host", exact: true }).click();
    await expect.poll(async () => (await json<HostState>(await admin.request.get(adminApi))).policy.enabled).toBe(false);
    await page.reload();
    await expect(source).toHaveValue("host");
    await expect(source.locator('option[value="host"]')).toBeDisabled();
    await expect(connection.getByText("Codex del Host deshabilitado", { exact: true })).toBeVisible();
    await expect(connection.getByText("No se cambiará de cuenta automáticamente.", { exact: false })).toBeVisible();
    await expect(hostChoice).toBeChecked();
    await expect(connection.getByRole("button", { name: "Probar conexión", exact: true })).toHaveCount(0);
    await expect(connection.getByRole("button", { name: "Guardar preferencia", exact: true })).toBeDisabled();
    const turnsBefore = (await methodsAt(hostHome)).filter(method => method === "turn/start");
    for (const data of [{ action: "models", source: "host" }, { action: "test", source: "host", model: "codex-e2e" }]) expect((await apiRequest(page).post(api, { data })).status()).toBe(403);
    expect((await methodsAt(hostHome)).filter(method => method === "turn/start")).toEqual(turnsBefore);
    expect((await state(page)).preference).toMatchObject({ enabled: true, source: "host" });

    await sharing.check();
    await hostPanel.getByRole("button", { name: "Guardar disponibilidad del Host", exact: true }).click();
    await expect.poll(async () => (await json<HostState>(await admin.request.get(adminApi))).policy.enabled).toBe(true);
    await loginAs(peer, peerEmail);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "local_only" } });
    const beforeLocalPolicy = (await methodsAt(hostHome)).filter(method => ["account/login/start", "turn/start"].includes(method));
    for (const data of [{ action: "models", source: "host" }, { action: "test", source: "host", model: "codex-e2e" }, { action: "save", source: "host", enabled: true, model: "codex-e2e" }]) expect((await apiRequest(peer).post(api, { data })).status()).toBe(403);
    for (const data of [{ action: "test", model: "codex-e2e" }, { action: "save", enabled: true }]) expect((await apiRequest(admin).post(adminApi, { data })).status()).toBe(403);
    expect((await state(peer)).remoteAllowed).toBe(false);
    expect((await methodsAt(hostHome)).filter(method => ["account/login/start", "turn/start"].includes(method))).toEqual(beforeLocalPolicy);
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });

    await hostPanel.getByRole("button", { name: "Desconectar cuenta del Host", exact: true }).click();
    await expect(hostPanel.getByText("Cuenta sin conectar", { exact: true })).toBeVisible();
    const revoked = await json<HostState>(await admin.request.get(adminApi));
    expect(revoked.connectionHost.connected).toBe(false);
    expect(revoked.policy.enabled).toBe(false);
    expect((await state(page)).preference).toMatchObject({ enabled: true, source: "host" });
    await page.reload();
    await expect(source).toHaveValue("host");
    await hostChoice.uncheck();
    await connection.getByRole("button", { name: "Guardar preferencia", exact: true }).click();
    await expect(connection.getByText("Preferencia guardada.", { exact: false })).toBeVisible();
    expect((await state(page)).preference).toMatchObject({ enabled: false, source: "host" });
  } finally {
    await db.firmSettings.update({ where: { id: firm.id }, data: { assistantLlmMode: "remote_allowed" } });
    await adminContext.close(); await peerContext.close();
  }
});
