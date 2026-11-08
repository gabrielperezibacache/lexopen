import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

// Browser contract fixtures: PostgreSQL and native gateway suites separately verify ACL and actual command semantics.
const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID().replaceAll("-", ""), folderId = `Folder_${tag}`, parentId = `Parent_${tag}`, fileId = `File_${tag}`;
const connectionId = `account-${tag}`, bindingRevision = "a".repeat(64), caseRevision = "b".repeat(64), sourceSha256 = "c".repeat(64);
let causaId = "", documentoId = "";
const base = () => ({ causaId, caseRevision, account: "altazor", connected: true, canRead: true, canManage: true, connectionId, bindingRevision, reason: null, canConfigure: true, folder: { id: folderId, name: "Carpeta del expediente ficticio", url: `https://drive.google.com/drive/folders/${folderId}` } });
const fixtureDocument = () => ({ id: documentoId, name: "Informe de prueba.txt", version: 3, sourceSha256, bytes: 128, mime: "text/plain", remoteTargetState: "none", canSave: true });
async function isolate(page: Page) {
  await page.route("**/*", route => { const url = new URL(route.request().url()); return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue(); });
  await page.route(`**/api/integrations/google/drive/${causaId}/sync`, route => route.fulfill({ json: { enabled: false, intervalMinutes: 60, lastRunAt: null, status: "paused", note: null, canConfigure: true, account: "altazor", connectionId, bindingRevision, folderId, generation: 2, accounts: { study: { configured: false }, personal: { connected: false, label: "", reason: null }, altazor: { connected: true, canManage: true, reason: null } } } }));
  await page.route(`**/api/causas/${causaId}/drive/commands`, route => route.request().method() === "GET" ? route.fulfill({ json: base() }) : route.fulfill({ status: 500, json: { error: "Unexpected fixture write" } }));
  await loginAs(page, "abogado@estudio.cl");
  await page.goto(`/causas/${causaId}`);
}
test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  const cause = await db.causa.create({ data: { titulo: `Drive management fixture ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, googleDriveFolderId: folderId, googleDriveFolderName: "Carpeta del expediente ficticio", googleDriveFolderUrl: `https://drive.google.com/drive/folders/${folderId}` } }); causaId = cause.id;
  const doc = await db.documento.create({ data: { causaId, autorId: owner.id, nombre: "Informe de prueba.txt", contenido: "Documento ficticio", version: 3 } }); documentoId = doc.id;
});
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("lexopen_theme", "dark")); });
test.afterAll(async () => { if (documentoId) await db.documento.deleteMany({ where: { id: documentoId } }); if (causaId) await db.causa.deleteMany({ where: { id: causaId } }); await db.$disconnect(); });

test("carpetas: cuenta única, destino fijado y creación sin repetir tras respuesta incierta", async ({ page }, testInfo) => {
  await isolate(page);
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/integrations/google/drive/${causaId}/folders?*`, route => route.fulfill({ json: { folders: new URL(route.request().url()).searchParams.get("parentId") === "root" ? [{ id: parentId, name: "Expedientes del estudio" }] : [], nextPageToken: null, incompleteSearch: false, account: "altazor", connectionId, bindingRevision, caseRevision, canManage: true } }));
  await page.route(`**/api/causas/${causaId}/drive/commands`, route => {
    if (route.request().method() === "GET") return route.fulfill({ json: base() });
    const input = route.request().postDataJSON(); commands.push(input);
    return input.action === "reconcile" ? route.fulfill({ json: { state: "completed", message: "Carpeta comprobada", folder: { id: folderId, name: "Nueva carpeta" } } }) : route.fulfill({ status: 202, json: { state: "unknown", message: "No se confirmó la respuesta." } });
  });
  await page.getByRole("button", { name: "Elegir carpeta de Google Drive", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Carpeta de esta causa" });
  await dialog.getByRole("button", { name: "Expedientes del estudio", exact: true }).click();
  await dialog.getByRole("button", { name: "Nueva carpeta aquí", exact: true }).click();
  await dialog.getByLabel("Nombre de la carpeta").fill("Nueva carpeta");
  expect(commands).toHaveLength(0);
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await dialog.screenshot({ path: testInfo.outputPath(`drive-folder-${label}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await dialog.getByRole("button", { name: "Crear y usar esta carpeta", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Crear y usar esta carpeta", exact: true })).toBeDisabled();
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ action: "create-folder", parentFolderId: parentId, nombre: "Nueva carpeta", connectionId, bindingRevision, caseRevision, confirmed: true });
  await dialog.getByRole("button", { name: "Comprobar resultado", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual({ action: "reconcile", requestId: commands[0].requestId, connectionId, bindingRevision, confirmed: true });
});

test("documento: revisar no escribe, confirmar fija contenido y nueva versión conserva el anterior", async ({ page }, testInfo) => {
  await isolate(page); const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/documentos/${documentoId}/drive`, route => route.fulfill({ json: { ...base(), document: { ...fixtureDocument(), remoteId: fileId, remoteVersion: "7", remoteTargetState: "ready" } } }));
  await page.route(`**/api/causas/${causaId}/drive/commands`, route => { commands.push(route.request().postDataJSON()); return route.fulfill({ json: { state: "completed", message: "Nueva versión guardada como una copia. El archivo anterior se conserva.", file: { id: `New_${fileId}`, name: fixtureDocument().name } } }); });
  await page.getByRole("button", { name: "Guardar en Google Drive", exact: true }).click();
  await expect(page.getByText("Carpeta: Carpeta del expediente ficticio. Versión 3 · 0,1 KB.", { exact: true })).toBeVisible();
  expect(commands).toHaveLength(0);
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); const confirm = page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true }); await confirm.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`drive-save-${label}.png`), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "El archivo anterior se conserva." })).toBeVisible();
  expect(commands).toHaveLength(1); expect(commands[0]).toMatchObject({ action: "save-version", documentoId, documentVersion: 3, sourceSha256, nombre: fixtureDocument().name, fileId, expectedVersion: "7", caseRevision, connectionId, bindingRevision, confirmed: true });
  await expect(page.getByRole("link", { name: "Abrir en Drive", exact: true }).last()).toHaveAttribute("href", `https://drive.google.com/file/d/New_${fileId}/view`);
});

test("sin permiso de gestión o archivo remoto no comprobable no ofrece escritura alternativa", async ({ page }) => {
  await isolate(page); let manage = false; const writes: unknown[] = [];
  await page.route(`**/api/documentos/${documentoId}/drive`, route => route.fulfill({ json: { ...base(), canManage: manage, document: { ...fixtureDocument(), remoteTargetState: manage ? "unavailable" : "none", canSave: false, reason: manage ? "No se pudo comprobar el archivo de Drive." : null } } }));
  await page.route(`**/api/causas/${causaId}/drive/commands`, route => { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 500 }); });
  await page.getByRole("button", { name: "Guardar en Google Drive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click(); manage = true;
  await page.getByRole("button", { name: "Guardar en Google Drive", exact: true }).click();
  await expect(page.getByText("No se pudo comprobar el archivo de Drive.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true })).toHaveCount(0); expect(writes).toEqual([]);
});

test("guardado incierto se recupera tras recargar, sin reenviar el documento", async ({ page }) => {
  await isolate(page); let pending = false; const commands: Record<string, unknown>[] = []; const requestId = `pending-${tag}`;
  await page.route(`**/api/documentos/${documentoId}/drive`, route => route.fulfill({ json: { ...base(), document: fixtureDocument(), ...(pending ? { pendingOperation: { requestId, documentoId, state: "unknown" } } : {}) } }));
  await page.route(`**/api/causas/${causaId}/drive/commands`, route => { const input = route.request().postDataJSON(); commands.push(input); pending = true; return route.fulfill({ status: 202, json: { state: "unknown", message: "No pudimos confirmar el resultado." } }); });
  await page.getByRole("button", { name: "Guardar en Google Drive", exact: true }).click(); await page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Guardar en Google Drive", exact: true })).toBeDisabled();
  await page.reload(); await page.getByRole("button", { name: "Guardar en Google Drive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar guardado en Drive", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Comprobar resultado", exact: true }).click();
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual({ action: "reconcile", requestId, connectionId, bindingRevision, confirmed: true });
});

test("recepción automática reutiliza la cuenta y fija carpeta y generación", async ({ page }) => {
  await isolate(page); const inputs: unknown[] = [];
  await page.route(`**/api/integrations/google/drive/${causaId}/sync`, route => { if (route.request().method() === "POST") inputs.push(route.request().postDataJSON()); return route.fulfill({ json: { enabled: inputs.length > 0, intervalMinutes: 60, lastRunAt: null, status: "paused", note: null, canConfigure: true, account: "altazor", connectionId, bindingRevision, folderId, generation: 2, accounts: { study: { configured: false }, personal: { connected: false, label: "", reason: null }, altazor: { connected: true, canManage: true, reason: null } } } }); });
  await page.reload(); await page.getByRole("button", { name: "Activar recepción automática", exact: true }).click();
  await expect(page.getByRole("button", { name: "Recibir ahora", exact: true })).toBeVisible();
  expect(inputs).toEqual([{ enabled: true, intervalMinutes: 60, account: "altazor", connectionId, bindingRevision, folderId, generation: 2 }]);
  await page.getByText("Frecuencia y opciones", { exact: true }).click(); await expect(page.getByLabel("Conexión anterior", { exact: true })).toHaveCount(0);
});

test("rutas compiladas existen y comprueban permisos antes de acceder a Google", async ({ page, browser }) => {
  await loginAs(page, "abogado@estudio.cl");
  const state = await page.request.get(`/api/causas/${causaId}/drive/commands`);
  expect(state.status(), await state.text()).toBe(200);
  expect(await state.json()).toMatchObject({ causaId, connected: false });
  const preview = await page.request.get(`/api/documentos/${documentoId}/drive`);
  expect(preview.status()).toBe(409); // No original is stored in this deliberately text-only fixture.
  const portal = await browser.newContext(); const outsider = await portal.newPage(); await loginAs(outsider, "cliente@andes.cl");
  expect((await outsider.request.get(`/api/causas/${causaId}/drive/commands`)).status()).toBe(403);
  expect((await outsider.request.get(`/api/documentos/${documentoId}/drive`)).status()).toBe(403);
  await portal.close();
});
