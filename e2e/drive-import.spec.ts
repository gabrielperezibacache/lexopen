import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID().replaceAll("-", ""), folderId = `DriveFolder_${tag}`, fileId = `DriveFile_${tag}`, nextId = `NextFile_${tag}`;
const name = "Documento ficticio de Drive para revisar la exportación elegida y conservar su procedencia";
let causaId = "";
test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  const cause = await db.causa.create({ data: { titulo: `Drive browser fixture ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, googleDriveFolderId: folderId, googleDriveFolderName: "Carpeta ficticia del expediente", googleDriveFolderUrl: `https://drive.google.com/drive/folders/${folderId}` } }); causaId = cause.id;
});
test.afterAll(async () => { if (causaId) await db.causa.deleteMany({ where: { id: causaId } }); await db.$disconnect(); });

test("Drive elegido: lista paginada, revisión, exportación, conflicto y recuperación (API fixture)", async ({ page, browser }, testInfo) => {
  let version = "30", attempts = 0;
  const selections: unknown[] = [], pages: (string | null)[] = [];
  const candidate = () => ({ id: fileId, name, mimeType: "application/vnd.google-apps.document", version, modifiedTime: "2026-01-15T10:00:00Z", sizeBytes: null, exportMimeType: "application/pdf", importable: true, reason: null });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  // UI contract fixture only: actual domain import/storage/ACL are covered by PostgreSQL integration.
  await page.route(`**/api/integrations/google/drive/${causaId}*`, async route => {
    if (route.request().method() === "GET") {
      const cursor = new URL(route.request().url()).searchParams.get("pageToken"); pages.push(cursor);
      return route.fulfill({ json: { folderId, files: cursor ? [{ ...candidate(), id: nextId, name: "Otro documento ficticio.pdf", mimeType: "application/pdf", exportMimeType: null }] : [candidate(), { ...candidate(), id: `Shortcut_${tag}`, name: "Acceso directo ficticio", mimeType: "application/vnd.google-apps.shortcut", importable: false, reason: "Tipo no admitido para importación" }], nextPageToken: cursor ? null : "fixture-page-2", incompleteSearch: false } });
    }
    selections.push(route.request().postDataJSON()); attempts++;
    return attempts === 1 ? route.fulfill({ status: 409, json: { error: "El archivo cambió en Drive. Revise y seleccione la nueva revisión" } }) : route.fulfill({ status: 201, json: { documentoId: `document-fixture-${tag}`, href: `/documentos/document-fixture-${tag}/fuentes`, reused: false } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto(`/causas/${causaId}`);
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Google Drive", exact: true }) });
  await panel.getByRole("button", { name: "Elegir archivos de Drive", exact: true }).click();
  await expect(panel.getByRole("radio", { name: `Seleccionar ${name}`, exact: true })).toBeVisible();
  await expect(panel.getByRole("radio", { name: "Seleccionar Acceso directo ficticio", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Guardar copia elegida en LexOpen", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(panel.getByText("Otro documento ficticio.pdf", { exact: true })).toBeVisible();
  expect(pages).toEqual([null, "fixture-page-2"]);
  await panel.getByRole("button", { name: "Primera página", exact: true }).click();
  await panel.getByRole("radio", { name: `Seleccionar ${name}`, exact: true }).check();
  await expect(panel.getByRole("heading", { name: "Revisar la copia elegida", exact: true })).toBeVisible();
  await expect(panel.getByText(/Se conservará una exportación PDF/)).toBeVisible();
  await expect(panel.getByText(/Se copiará sólo este archivo/)).toBeVisible();
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await panel.screenshot({ path: testInfo.outputPath(`drive-selection-${label}.png`) });
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll("main *")].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 12).map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 60), right: element.getBoundingClientRect().right })) }));
    expect(layout.width <= layout.viewport, JSON.stringify(layout)).toBeTruthy();
  }
  await panel.getByRole("button", { name: "Guardar copia elegida en LexOpen", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("El archivo cambió en Drive");
  expect(selections).toEqual([{ folderId, fileId, version: "30" }]);
  version = "31";
  await panel.getByRole("button", { name: "Elegir archivos de Drive", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Revisar la copia elegida", exact: true })).toHaveCount(0);
  await panel.getByRole("radio", { name: `Seleccionar ${name}`, exact: true }).check();
  await expect(panel.getByText(/Revisión 31\. Se conservará/)).toBeVisible();
  await panel.getByRole("button", { name: "Guardar copia elegida en LexOpen", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Copia guardada en el expediente");
  await expect(panel.getByRole("link", { name: "Abrir copia en el expediente", exact: true })).toHaveAttribute("href", `/documentos/document-fixture-${tag}/fuentes`);
  expect(selections).toEqual([{ folderId, fileId, version: "30" }, { folderId, fileId, version: "31" }]);
  // These requests bypass the browser route fixture and verify actual server authorization before OAuth.
  const other = await browser.newContext(); const outsider = await other.newPage();
  await loginAs(outsider, "cliente@andes.cl");
  expect((await outsider.request.get(`/api/integrations/google/drive/${causaId}`)).status()).toBe(403);
  expect((await outsider.request.post(`/api/integrations/google/drive/${causaId}`, { data: { folderId, fileId, version: "31" } })).status()).toBe(403);
  await other.close();
});
