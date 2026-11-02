import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Space browser fixtures require local storage");
const tag = randomUUID(), token = `spaceproof${tag.slice(0, 8)}`;
const pdfName = `PDF de espacio ${tag}.pdf`, textName = `Contrato del espacio ${tag}.txt`;
const text = `Primera versión ficticia de ${token}: contrato y pago del archivo del espacio. Texto propio de prueba con acentos.`;
const nextText = `Segunda versión ficticia de ${token}: contrato y pago actualizado. Se conserva el original y la cita de la primera versión.`;
const sourcePrefix = `space-browser/${tag}`;
const storageRoot = path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
let ownerId = "", otherId = "", caseId = "", siteId = "", pdfId = "", textId = "";
let pdfBytes: Buffer;

test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } }); ownerId = owner.id;
  otherId = (await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } })).id;
  const matter = await db.causa.create({ data: { titulo: `Espacio de prueba ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: ownerId } }); caseId = matter.id;
  const site = await db.site.create({ data: { name: `Espacio verificable ${tag}`, slug: `proof-${tag}`, causaId: caseId } }); siteId = site.id;
  pdfBytes = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
  const key = `${sourcePrefix}/original.pdf`;
  await putObject({ key, body: pdfBytes, contentType: "application/pdf" });
  pdfId = (await db.siteFile.create({ data: { siteId, name: pdfName, mimeType: "application/pdf", storageKey: key } })).id;
  textId = (await db.siteFile.create({ data: { siteId, name: textName, mimeType: "text/plain", contenido: text } })).id;
});
test.afterAll(async () => {
  try {
    const runs = await db.researchRun.findMany({ where: { ownerId: ownerId || "__none__", query: { contains: token } }, select: { id: true } });
    await db.auditEvent.deleteMany({ where: { entityId: { in: [pdfId, textId, siteId, caseId, ...runs.map(run => run.id)].filter(Boolean) } } });
    await db.researchRun.deleteMany({ where: { id: { in: runs.map(run => run.id) } } });
    if (siteId) await db.site.deleteMany({ where: { id: siteId } });
    if (caseId) await db.causa.deleteMany({ where: { id: caseId } });
    await rm(path.join(storageRoot, sourcePrefix), { recursive: true, force: true });
    for (const id of [pdfId, textId].filter(Boolean)) await rm(path.join(storageRoot, "evidence", "site-file", encodeURIComponent(id)), { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});

test("archivos de espacios: páginas, versiones, investigación y permiso actual", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await loginAs(page, "abogado@estudio.cl");
  await page.goto(`/sites/${siteId}/archivos`);
  await page.locator(`a[href="/sites/${siteId}/archivos/${pdfId}/fuentes"]`).click();
  await expect(page.getByRole("heading", { name: pdfName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preparar fuentes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fragmento 1 · Página 1", exact: true })).toBeVisible({ timeout: 20_000 });
  const pdf = await (await page.request.get(`/api/sites/${siteId}/files/${pdfId}/evidence`)).json();
  await page.getByLabel("Página del PDF", { exact: true }).selectOption("2");
  await expect(page.getByRole("heading", { name: "Fragmento 2 · Página 2", exact: true })).toBeVisible();
  const image = page.getByRole("img", { name: `Página 2 de ${pdfName}`, exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(page.getByText(/HECHO FICTICIO: PAGO EL 12 DE MAYO DE 2025/)).toBeVisible();
  await page.getByRole("button", { name: "Copiar referencia del fragmento 2", exact: true }).click();
  const reference = page.getByLabel("Copie esta referencia", { exact: true });
  await expect(reference).toBeVisible();
  expect(await reference.inputValue()).toContain(`/sites/${siteId}/archivos/${pdfId}/fuentes`);
  expect(await reference.inputValue()).toContain("page=2");
  await page.getByRole("button", { name: "Cerrar referencia", exact: true }).click();
  async function capture(name: string) {
    for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport); await page.screenshot({ path: testInfo.outputPath(`${name}-${label}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await capture("space-pdf");
  const retainedPdf = await page.request.get(`/api/evidence/versions/${pdf.selectedVersionId}/original`);
  expect(retainedPdf.ok()).toBeTruthy(); expect(digest(await retainedPdf.body())).toBe(digest(pdfBytes));
  await page.goto(`/sites/${siteId}/archivos/${textId}/fuentes`);
  await page.getByRole("button", { name: "Preparar fuentes", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  const original = await (await page.request.get(`/api/sites/${siteId}/files/${textId}/evidence`)).json();
  const oldVersion = original.selectedVersionId;
  await db.siteFile.update({ where: { id: textId }, data: { contenido: nextText, version: 2 } });
  await page.getByRole("button", { name: "Preparar versión actual", exact: true }).click();
  await expect(page.getByText(nextText, { exact: true })).toBeVisible();
  const current = await (await page.request.get(`/api/sites/${siteId}/files/${textId}/evidence`)).json();
  expect(current.selectedVersionId).not.toBe(oldVersion);
  await page.goto(`/sites/${siteId}/archivos/${textId}/fuentes?version=${oldVersion}`);
  await expect(page.getByLabel("Versión consultada", { exact: true })).toHaveValue(oldVersion);
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/evidence/versions/${oldVersion}/original`)).body()).toString()).toBe(text);
  await capture("space-version-anterior");
  await page.goto("/jurisprudencia");
  const workbench = page.locator('section[aria-labelledby="research-title"]');
  await workbench.locator("#research-site").selectOption(siteId);
  await workbench.getByRole("checkbox", { name: "Elegir archivos concretos del espacio", exact: true }).check();
  await workbench.getByRole("checkbox", { name: textName, exact: true }).check();
  await workbench.locator("#research-query").fill(token);
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: "Consultar mis fuentes", exact: true }).click();
  const searched = await pending; expect(searched.status(), await searched.text()).toBe(201);
  const run = await searched.json();
  expect(run.scope.siteId).toBe(siteId); expect(run.scope.selectedSiteFileIds).toEqual([textId]);
  expect(run.coverage.networkRequests).toBe(0); expect(run.coverage.modelUsed).toBe(false);
  const citation = run.results.find((entry: { siteFileId: string }) => entry.siteFileId === textId);
  expect(citation).toBeTruthy(); expect(citation.versionId).toBe(current.selectedVersionId); expect(citation.quote).toBe(nextText);
  await expect(workbench.getByText(nextText, { exact: true })).toBeVisible();
  await page.reload();
  await expect(workbench.locator("#research-site")).toHaveValue(siteId);
  await expect(workbench.getByRole("checkbox", { name: textName, exact: true })).toBeChecked();
  await expect(workbench.getByText(nextText, { exact: true })).toBeVisible();
  await capture("space-research");
  await workbench.getByRole("link", { name: "Abrir fragmento y versión", exact: true }).click();
  await expect(page.getByRole("heading", { name: textName, exact: true })).toBeVisible();
  await expect(page.getByLabel("Versión consultada", { exact: true })).toHaveValue(current.selectedVersionId);
  const portal = await browser.newContext();
  try {
    const client = await portal.newPage(); await loginAs(client, "cliente@andes.cl");
    expect([403, 404]).toContain((await client.request.get(`/api/sites/${siteId}/files/${pdfId}/evidence`)).status());
    expect([403, 404]).toContain((await client.request.get(`/api/evidence/versions/${pdf.selectedVersionId}/pages/2`)).status());
  } finally { await portal.close(); }
  await db.causa.update({ where: { id: caseId }, data: { abogadoId: otherId } });
  expect((await page.request.get(`/api/sites/${siteId}/files/${textId}/evidence?version=${oldVersion}`)).status()).toBe(404);
  expect((await page.request.get(`/api/evidence/versions/${pdf.selectedVersionId}/pages/2`)).status()).toBe(404);
  expect((await page.request.get(`/api/evidence/versions/${oldVersion}/original`)).status()).toBe(404);
  expect((await page.request.get(`/api/research/${run.id}`)).status()).toBe(404);
});
