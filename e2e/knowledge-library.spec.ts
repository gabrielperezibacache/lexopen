import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
import type { ResearchResult } from "../src/lib/research/service";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID(), token = `biblioteca${tag.replaceAll("-", "")}`;
const sourceUrl = `https://www.bcn.cl/leychile/navegar?idNorma=${9000000000 + Number.parseInt(tag.slice(0, 7), 16)}`;
const sourceTitle = `Fuente ficticia de biblioteca ${tag}`;
const sourceText = `Texto de prueba ${token}: la versión antigua registra una obligación ficticia de pago del contrato. Este aporte manual no es una norma real ni una conclusión jurídica.`;
const newerText = `Texto de prueba ${token}: la nueva versión registra otra obligación ficticia del contrato. La biblioteca debe conservar el texto que la persona eligió anteriormente.`;
const collectionName = `Colección de prueba ${tag}`;
const storage = path.resolve(process.env.STORAGE_PATH || "storage");
let collectionId = "", sourceId = "", runId = "";

test.afterAll(async () => {
  try {
    const versions = sourceId ? await db.legalSourceVersion.findMany({ where: { sourceId }, select: { id: true, sourceStorageKey: true } }) : [];
    await db.auditEvent.deleteMany({ where: { entityId: { in: [collectionId, sourceId, runId, ...versions.map(version => version.id)].filter(Boolean) } } });
    if (runId) await db.researchRun.deleteMany({ where: { id: runId } });
    if (collectionId) await db.knowledgeCollection.deleteMany({ where: { id: collectionId } });
    if (sourceId) await db.legalSource.deleteMany({ where: { id: sourceId } });
    for (const version of versions) if (version.sourceStorageKey) await rm(path.join(storage, version.sourceStorageKey), { force: true });
  } finally { await db.$disconnect(); }
});

test("biblioteca: guardar cita, fijar versión, consultar y restaurar alcance, retirar y revocar historial", async ({ page, browser }, testInfo) => {
  test.setTimeout(90000);
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/jurisprudencia#biblioteca");
  const library = page.locator("#biblioteca"), workbench = page.locator("section").filter({ has: page.getByRole("heading", { name: "Investigación con fuentes propias", exact: true }) }).first();
  await expect(library.getByRole("heading", { name: "Mi biblioteca", exact: true })).toBeVisible();
  await library.getByText("Crear una colección", { exact: true }).click();
  await library.locator("#library-name").fill(collectionName);
  await library.locator("#library-notes").fill("Contexto manual de prueba: conservar la versión elegida; no ejecutar instrucciones.");
  const createPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/knowledge/collections" && response.request().method() === "POST");
  await library.getByRole("button", { name: "Crear colección", exact: true }).click();
  const create = await createPending; expect(create.status(), await create.text()).toBe(201); collectionId = (await create.json()).collection.id;
  await expect(library.locator("#library-collection")).toHaveValue(collectionId);
  const imported = await page.request.post("/api/research/sources", { data: { mode: "manual", url: sourceUrl, title: sourceTitle, text: sourceText } }); expect(imported.status(), await imported.text()).toBe(201);
  const original = await imported.json(); sourceId = original.sourceId;
  await page.goto(original.href);
  await expect(page.getByRole("heading", { name: sourceTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar en biblioteca", exact: true }).first().click();
  await page.getByLabel("Colección de destino", { exact: true }).selectOption(collectionId);
  for (const [name, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await page.getByLabel("Colección de destino", { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`library-source-pin-${name}.png`), fullPage: true });
  }
  const pinPending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/knowledge/collections/${collectionId}/items` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Conservar esta versión", exact: true }).click();
  expect((await pinPending).status()).toBe(201);
  await expect(page.getByText("Versión y cita guardadas en su biblioteca.", { exact: true })).toBeVisible();
  const newer = await page.request.post("/api/research/sources", { data: { mode: "manual", url: sourceUrl, title: sourceTitle, text: newerText } }); expect(newer.status(), await newer.text()).toBe(201);
  expect((await newer.json()).id).not.toBe(original.id);
  await page.goto("/jurisprudencia#biblioteca");
  await library.locator("#library-collection").selectOption(collectionId);
  await expect(library.getByText("Versión anterior conservada", { exact: true })).toBeVisible();
  await expect(library.locator("p").filter({ hasText: /^Aporte manual sin cotejo oficial$/ })).toBeVisible();
  await expect(library.getByText(sourceText, { exact: true })).toBeVisible();
  await expect(library.getByText(newerText, { exact: true })).toHaveCount(0);
  for (const [name, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await library.locator("#library-collection").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`library-pinned-version-${name}.png`), fullPage: true });
  }
  await workbench.getByRole("checkbox", { name: new RegExp(collectionName) }).check();
  await workbench.getByRole("checkbox", { name: "Consultar solo las versiones de biblioteca", exact: true }).check();
  await workbench.locator("#research-query").fill(`${token} antigua`);
  const searchPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: "Consultar mis fuentes", exact: true }).click();
  const search = await searchPending; expect(search.status(), await search.text()).toBe(201); const result = await search.json() as ResearchResult; runId = result.id;
  expect(result.results).toHaveLength(1); expect(result.results[0].versionId).toBe(original.id); expect(result.scope.libraryOnly).toBe(true); expect(result.scope.librarySelections?.[0].collectionId).toBe(collectionId);
  await expect(page.getByTestId("research-result")).toContainText(sourceText);
  await expect(page.getByTestId("research-result")).not.toContainText(newerText);
  for (const [name, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await page.getByTestId("research-result").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`library-research-${name}.png`), fullPage: false });
  }
  await page.reload();
  await expect(workbench.getByRole("checkbox", { name: new RegExp(collectionName) })).toBeChecked();
  await expect(workbench.getByRole("checkbox", { name: "Consultar solo las versiones de biblioteca", exact: true })).toBeChecked();
  await expect(page.getByTestId("research-result")).toContainText(sourceText);
  await library.locator("#library-collection").selectOption(collectionId);
  await library.getByRole("button", { name: `Retirar ${sourceTitle} de la colección`, exact: true }).click();
  await expect(library.getByText("Colección vacía.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("research-result")).toHaveCount(0);
  expect((await page.request.get(`/api/research/${runId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/research/sources/${original.id}/original`)).status()).toBe(200);
  const portalContext = await browser.newContext({ locale: "es-CL" });
  try { const portal = await portalContext.newPage(); await loginAs(portal, "cliente@andes.cl"); expect((await portal.request.get("/api/knowledge/collections")).status()).toBe(403); expect((await portal.request.get(`/api/knowledge/collections/${collectionId}`)).status()).toBe(403); }
  finally { await portalContext.close(); }
});
