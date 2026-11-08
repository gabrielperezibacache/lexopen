import { test as baseTest, expect, type Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable browser database required");
import { networkGateway } from "./fixtures/network-gateway";
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const gateway = await networkGateway(String(info.project.use.baseURL)); try { await provide(gateway); } finally { await gateway.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
const key = "fictional-offline-key-for-fixtures";
async function fixture(page: Page) {
  const tag = randomUUID();
  const user = await prisma.user.create({ data: { name: "Profesional offline ficticio", email: `${tag}@offline.invalid`, role: "abogado", password: await hash("lexopen", 10) } });
  const other = await prisma.user.create({ data: { name: "Otra cuenta ficticia", email: `${tag}-other@offline.invalid`, role: "abogado", password: await hash("lexopen", 10) } });
  const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: user.id } });
  await loginAs(page, user.email); await authenticateApiRequests(page);
  const response = await apiRequest(page).post(`/api/causas/${cause.id}/writings`, { data: { requestId: randomUUID(), title: "Escrito sin conexión ficticio", body: "Texto inicial confidencial ficticio" } }); expect(response.status()).toBe(201);
  const { draft } = await response.json(), url = `/offline.html?case=${cause.id}&draft=${draft.id}`, api = `/api/causas/${cause.id}/writings/${draft.id}`;
  return { user, other, cause, draft, url, api, cleanup: async () => {
    await prisma.caseWritingDraft.deleteMany({ where: { causaId: cause.id } }); await prisma.causa.delete({ where: { id: cause.id } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [user.id, other.id] } } }); await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  } };
}
async function prepare(page: Page, url: string, keyboard = false) {
  await page.goto(url); await expect(page.getByRole("button", { name: "Crear espacio cifrado", exact: true })).toBeVisible();
  await page.getByLabel("Clave del espacio local").fill(key);
  page.once("dialog", dialog => dialog.accept());
  if (keyboard) await page.getByLabel("Clave del espacio local").press("Enter");
  else await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preparar este escrito", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preparar este escrito", exact: true }).click();
  await expect(page.getByLabel("Texto del escrito", { exact: true })).toBeVisible();
  await expect(page.locator("#message")).toContainText("Escrito preparado");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByLabel("Texto del escrito", { exact: true })).toBeVisible(); }
async function edit(page: Page, text: string) { await page.getByLabel("Texto del escrito", { exact: true }).fill(text); await expect(page.locator("#local-state")).toHaveText("Copia local guardada"); }

test("copia cifrada, recarga sin red, shell público y sincronización manual sin duplicados", async ({ page, network }, info) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url, true);
    const stored = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("lexopen-offline-v1"); r.onsuccess = () => resolve(r.result); r.onerror = reject; }); const row = await new Promise<{ bytes: ArrayBuffer }>(resolve => { const r = db.transaction("vault").objectStore("vault").get("workspace"); r.onsuccess = () => resolve(r.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes); });
    expect(stored).not.toContain(f.user.id); expect(stored).not.toContain("Texto inicial confidencial");
    network.setOffline(true); await edit(page, "Texto redactado sin red y recuperable tras recargar"); await page.reload();
    await expect(page.getByLabel("Clave del espacio local")).toBeVisible(); await expect(page.locator("#body")).toHaveValue("");
    await page.getByLabel("Clave del espacio local").fill("wrong-key-at-least-twelve"); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.locator("#message")).toContainText("La clave no permite abrir");
    await unlock(page); await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue("Texto redactado sin red y recuperable tras recargar");
    const cached = await page.evaluate(async () => { const cache = await caches.open("lexopen-offline-shell-v8"); return (await cache.keys()).map(r => new URL(r.url).pathname); });
    expect(cached.sort()).toEqual(["/offline.html", "/offline/vault.js", "/offline/workspace.css", "/offline/workspace.js", "/offline/records.js", "/offline/bindings.js", "/offline/memos.js", "/offline/files.js", "/offline/operations.js"].sort());
    expect(await page.evaluate(async api => { try { await fetch(api); return "unexpected network/cache"; } catch { return "offline"; } }, f.api)).toBe("offline");
    for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 1000 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`offline-${viewport.width}.png`), animations: "disabled" }); }
    network.setOffline(false); await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toHaveText("Escrito sincronizado. Los cambios ya están en LexOpen.");
    const saved = await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } }); expect(saved.body).toBe("Texto redactado sin red y recuperable tras recargar"); expect(saved.revision).toBe(2);
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("no tiene cambios locales pendientes"); expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: saved.id } })).revision).toBe(2);
    await page.getByRole("button", { name: "Bloquear espacio", exact: true }).click(); await expect(page.locator("#body")).toHaveValue(""); await expect(page.getByRole("button", { name: "Desbloquear", exact: true })).toBeVisible();
  } finally { network.setOffline(false); await f.cleanup(); }
});

test("respuesta perdida: reintenta el mismo recibo antes de enviar cambios posteriores", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url); await edit(page, "Primer envío con respuesta perdida");
    network.dropNextPatch(f.api);
    const requests = () => network.patches.filter(item => item.path === f.api).map(item => item.body);
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.reload(); await unlock(page); await edit(page, "Segundo texto local posterior");
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Envío anterior confirmado"); expect(requests()[1]).toBe(requests()[0]);
    expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).body).toBe("Primer envío con respuesta perdida");
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Escrito sincronizado");
    expect(JSON.parse(requests()[2]).requestId).not.toBe(JSON.parse(requests()[0]).requestId); expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).revision).toBe(3);
  } finally { await f.cleanup(); }
});

test("un conflicto conserva el texto local y no sobrescribe la versión del servidor", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url); await edit(page, "Mi texto local en conflicto");
    expect((await apiRequest(page).patch(f.api, { data: { requestId: randomUUID(), expectedRevision: 1, title: f.draft.title, body: "Edición independiente del servidor" } })).status()).toBe(200);
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Hay cambios en otra sesión");
    await page.reload(); await unlock(page); await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue("Mi texto local en conflicto");
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Hay cambios en otra sesión");
    expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).body).toBe("Edición independiente del servidor");
  } finally { await f.cleanup(); }
});

test("reautenticación con la misma cuenta, aislamiento entre cuentas y revocación de permisos", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url); await edit(page, "Texto local protegido por permisos actuales");
    await apiRequest(page).post("/api/auth/logout"); await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await loginAs(page, f.other.email); await authenticateApiRequests(page); await page.goto(f.url); await unlock(page);
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("otra cuenta"); expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).revision).toBe(1);
    await apiRequest(page).post("/api/auth/logout"); await loginAs(page, f.user.email); await authenticateApiRequests(page); await page.goto(f.url); await unlock(page);
    await prisma.user.update({ where: { id: f.user.id }, data: { capabilityRevokes: "causa.write" } });
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).revision).toBe(1);
    await prisma.user.update({ where: { id: f.user.id }, data: { capabilityRevokes: "" } });
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Escrito sincronizado");
  } finally { await f.cleanup(); }
});

test("almacenamiento denegado muestra recuperación y nunca afirma que el texto está guardado", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { value: undefined }); });
  await page.goto("/offline.html"); await expect(page.locator("#message")).toContainText("almacenamiento del navegador habilitado"); await expect(page.locator("#create")).toBeDisabled(); await expect(page.locator("#unlock")).toBeDisabled();
});


test("otra pestaña no puede sobrescribir ni borrar una copia local más reciente", async ({ page }) => {
  await page.goto("/offline.html");
  const result = await page.evaluate(async password => {
    const path = "/offline/vault.js", { openVaultStore } = await import(path);
    const first = await openVaultStore(), second = await openVaultStore();
    const a = await first.create(password, "opaque-fixture-owner"), b = await second.unlock(password);
    a.entries.push({ id: "first", title: "Primera pestaña" }); await first.write(a);
    const errors = [];
    b.entries.push({ id: "second", title: "Segunda pestaña" });
    try { await second.write(b); } catch (error) { errors.push((error as Error).message); }
    try { await second.remove(); } catch (error) { errors.push((error as Error).message); }
    const current = await second.unlock(password); first.lock();
    try { await first.write(a); } catch (error) { errors.push((error as Error).message); }
    return { errors, entries: current.entries };
  }, key);
  expect(result.errors).toHaveLength(3); expect(result.entries.map((item: { id: string }) => item.id)).toEqual(["first"]);
});

test("una cuota agotada conserva el texto visible y permite descargarlo", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url);
    await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException("Fictitious quota failure", "QuotaExceededError"); }; });
    await page.getByLabel("Texto del escrito", { exact: true }).fill("Texto recuperable aunque falle el disco local");
    await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await expect(page.locator("#local-state")).toHaveText("Copia local sin guardar · descargue el texto");
    await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue("Texto recuperable aunque falle el disco local");
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar copia local", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("escrito-local.txt");
    expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: f.draft.id } })).revision).toBe(1);
  } finally { await f.cleanup(); }
});

test("la activación elimina el antiguo cache de páginas autenticadas", async ({ page }) => {
  await page.goto("/offline/workspace.css");
  await page.evaluate(async () => { const old = await caches.open("lexopen-shell-v1"); await old.put("/", new Response("private-legacy-fixture")); const other = await caches.open("unrelated-cache"); await other.put("/fixture", new Response("other")); });
  await page.goto("/offline.html"); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const keys = await page.evaluate(() => caches.keys()); expect(keys).not.toContain("lexopen-shell-v1"); expect(keys).toContain("unrelated-cache");
});
