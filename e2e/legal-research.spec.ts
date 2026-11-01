import { test, expect, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { ResearchResult } from "../src/lib/research/service";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID();
const token = `evidencia${tag.replaceAll("-", "")}`;
const query = `${token} decisión`;
const sourceUrl = `https://www.dt.gob.cl/legislacion/1624/w3-article-9${parseInt(tag.replaceAll("-", "").slice(0, 7), 16).toString().padStart(9, "0")}.html`;
const sourceTitle = `Fuente manual ficticia ${token}`;
const sourceText = `Texto ficticio de investigación: ${token}. Esta decisión de prueba registra un contrato imaginario y una obligación de pago pendiente. Este aporte manual sirve exclusivamente para comprobar citas y versiones en LexOpen.`;
const nextSourceText = `Segunda versión ficticia: ${token}. La decisión de prueba ahora incorpora un acuerdo posterior. El contenido anterior permanece identificado en su primera versión para revisar la cita guardada.`;
const causeTitle = `Expediente de investigación ${tag}`;
const hiddenTitle = `Expediente reservado ${tag}`;
const documentName = `Documento de decisión ${tag}.pdf`;
const storageRoot = path.resolve(process.env.STORAGE_PATH || "storage");
const originalKey = `e2e-research/${tag}/original.pdf`;
let ownerId = "", causeId = "", hiddenCaseId = "", documentId = "", hiddenDocumentId = "";

test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } }); ownerId = owner.id;
  const other = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
  const cause = await db.causa.create({ data: { titulo: causeTitle, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causeId = cause.id;
  const hidden = await db.causa.create({ data: { titulo: hiddenTitle, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: other.id } }); hiddenCaseId = hidden.id;
  const original = await fs.readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
  await fs.mkdir(path.dirname(path.join(storageRoot, originalKey)), { recursive: true });
  await fs.writeFile(path.join(storageRoot, originalKey), original);
  const document = await db.documento.create({ data: { nombre: documentName, storageKey: originalKey, mimeType: "application/pdf", extractionStatus: "completed", causaId: causeId, autorId: owner.id } }); documentId = document.id;
  const hiddenDocument = await db.documento.create({ data: { nombre: `Documento reservado ${tag}`, contenido: `${token} decisión privada que no debe aparecer`, extractionStatus: "completed", causaId: hidden.id, autorId: other.id } }); hiddenDocumentId = hiddenDocument.id;
});

test.afterAll(async () => {
  try {
    const versions = await db.legalSourceVersion.findMany({ where: { source: { canonicalUrl: sourceUrl } }, select: { id: true, sourceStorageKey: true } });
    const documents = await db.documentEvidenceVersion.findMany({ where: { resource: { documentoId: documentId || "__none__" } }, select: { sourceStorageKey: true } });
    const runs = await db.researchRun.findMany({ where: { ownerId: ownerId || "__none__", query: { contains: token } }, select: { id: true } });
    await db.auditEvent.deleteMany({ where: { entityId: { in: [documentId, hiddenDocumentId, causeId, hiddenCaseId, ...versions.map(v => v.id), ...runs.map(r => r.id)].filter(Boolean) } } });
    await db.researchRun.deleteMany({ where: { id: { in: runs.map(r => r.id) } } });
    await db.legalSource.deleteMany({ where: { canonicalUrl: sourceUrl } });
    await db.documento.deleteMany({ where: { id: { in: [documentId, hiddenDocumentId].filter(Boolean) } } });
    await db.causa.deleteMany({ where: { id: { in: [causeId, hiddenCaseId].filter(Boolean) } } });
    const keys = new Set([originalKey, ...versions.map(v => v.sourceStorageKey), ...documents.map(v => v.sourceStorageKey)].filter((v): v is string => Boolean(v)));
    for (const key of keys) {
      const file = path.resolve(storageRoot, key);
      if (file.startsWith(`${storageRoot}${path.sep}`)) await fs.rm(file, { force: true });
    }
  } finally { await db.$disconnect(); }
});

test("investigación propia: aporte manual, expediente PDF, citas, historial y abstención", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const externalRequests: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) { externalRequests.push(url.origin); return route.abort(); }
    return route.continue();
  });
  await loginAs(page, "abogado@estudio.cl");
  const prepared = await page.request.post(`/api/documentos/${documentId}/evidence`);
  expect(prepared.status(), await prepared.text()).toBe(201);
  await page.goto("/jurisprudencia");
  const workbench = page.locator('section[aria-labelledby="research-title"]');
  async function captureState(name: string, target: Locator) {
    const previous = page.viewportSize();
    for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport);
      await target.screenshot({ path: testInfo.outputPath(`research-${name}-${label}.png`) });
    }
    if (previous) await page.setViewportSize(previous);
  }
  await expect(workbench.getByRole("heading", { name: "Investigación con fuentes propias" })).toBeVisible();
  await expect(workbench.locator("#research-case option").filter({ hasText: hiddenTitle })).toHaveCount(0);
  await workbench.locator("#research-case").selectOption(causeId);
  await workbench.locator("#research-query").fill(query);
  await captureState("consulta", workbench);
  await workbench.getByRole("button", { name: "Fuentes", exact: true }).click();
  await workbench.locator("#research-source-url").fill(sourceUrl);
  await captureState("fuentes-url", workbench);
  await workbench.getByRole("checkbox", { name: "Incorporar texto manualmente" }).check();
  await expect(workbench.getByText("El texto se identificará como aporte manual.", { exact: false })).toBeVisible();
  await workbench.locator("#research-source-title").fill(sourceTitle);
  await workbench.locator("#research-source-date").fill("2026-01-15");
  await workbench.locator("#research-source-text").fill(sourceText);
  await captureState("fuentes-manual", workbench);
  const importPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research/sources" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: "Registrar aporte manual", exact: true }).click();
  const importedResponse = await importPending;
  expect(importedResponse.status(), await importedResponse.text()).toBe(201);
  const imported = await importedResponse.json() as { id: string; acquisitionMethod: string };
  expect(imported.acquisitionMethod).toBe("manual");
  const sent = importedResponse.request().postDataJSON() as Record<string, unknown>;
  expect(sent.mode).toBe("manual"); expect(sent).not.toHaveProperty("query"); expect(sent).not.toHaveProperty("causaId");
  await expect(workbench.getByRole("status").filter({ hasText: "Fuente incorporada" })).toContainText(/manual|persona/i);

  await workbench.getByRole("button", { name: "Consultar", exact: true }).click();
  const searchPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: "Consultar mis fuentes", exact: true }).click();
  const searched = await searchPending;
  expect(searched.status(), await searched.text()).toBe(201);
  const result = await searched.json() as ResearchResult;
  expect(result.status).toBe("completed"); expect(result.answerMode).toBe("extractive");
  expect(result.scope.causaId).toBe(causeId);
  expect(result.coverage.networkRequests).toBe(0); expect(result.coverage.modelUsed).toBe(false);
  const legal = result.results.find(citation => citation.kind === "legal" && citation.versionId === imported.id);
  const docCitation = result.results.find(citation => citation.kind === "document" && citation.documentId === documentId && citation.pageNumber === 1);
  expect(legal).toBeTruthy(); expect(docCitation).toBeTruthy();
  expect(legal!.acquisitionMethod).toBe("manual"); expect(legal!.effectiveFrom).toBeNull(); expect(legal!.effectiveTo).toBeNull();
  expect(docCitation!.extractionMethod).toBe("native"); expect(docCitation!.href).toContain("page=1");
  for (const secret of [hiddenTitle, hiddenCaseId, hiddenDocumentId]) expect(JSON.stringify(result)).not.toContain(secret);
  await expect(page.getByTestId("research-result")).toContainText("No se generó una conclusión jurídica automática");
  await expect(page.getByTestId("research-result")).toContainText("Aporte manual sin cotejo oficial");
  const invented = await page.request.post("/api/research/citations/verify", { data: { kind: "legal", fragmentId: legal!.fragmentId, quote: "Una conclusión que nunca figura en la fuente" } });
  expect(invented.ok()).toBeTruthy(); expect((await invented.json()).verified).toBe(false);
  const verifyPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research/citations/verify" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: `Copiar cita de ${sourceTitle}`, exact: true }).click();
  expect((await (await verifyPending).json()).verified).toBe(true);
  await expect(workbench.getByText("Cita del texto registrado copiada.", { exact: true }).or(workbench.getByLabel("Copie esta cita", { exact: true }))).toBeVisible();

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByTestId("research-result").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("research-desktop.png"), fullPage: false });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByTestId("research-result").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("research-mobile.png"), fullPage: false });

  await page.reload();
  await expect(workbench.locator("#research-query")).toHaveValue(query);
  await expect(workbench.locator("#research-case")).toHaveValue(causeId);
  await expect(page.getByTestId("research-result")).toContainText(sourceText);
  await workbench.getByRole("button", { name: "Historial", exact: true }).click();
  const saved = workbench.locator("li").filter({ hasText: query });
  await expect(saved).toHaveCount(1);
  await saved.getByRole("button", { name: "Retomar consulta", exact: true }).click();
  await expect(workbench.locator("#research-case")).toHaveValue(causeId);
  await expect(page.getByTestId("research-result")).toContainText(sourceText);

  // Changing the draft must never attribute an earlier result to the new scope.
  async function restoreSaved() {
    await workbench.getByRole("button", { name: "Historial", exact: true }).click();
    await workbench.locator("li").filter({ hasText: query }).getByRole("button", { name: "Retomar consulta", exact: true }).click();
    await expect(page.getByTestId("research-result")).toBeVisible();
  }
  await expect(workbench.getByText("OCR local · contraste la cita con la imagen de la página", { exact: true })).toBeVisible();
  await workbench.locator("#research-query").fill(query + " modificado");
  await expect(page.getByTestId("research-result")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("investigacion")).toBe(false);
  await restoreSaved();
  await workbench.getByLabel("Legislación", { exact: true }).uncheck();
  await expect(page.getByTestId("research-result")).toHaveCount(0);
  await restoreSaved();
  await workbench.locator("#research-case").selectOption("");
  await expect(page.getByTestId("research-result")).toHaveCount(0);
  await restoreSaved();

  const newer = await page.request.post("/api/research/sources", { data: { mode: "manual", url: sourceUrl, title: sourceTitle, publishedAt: "2026-01-15", text: nextSourceText } });
  expect(newer.status(), await newer.text()).toBe(201); expect((await newer.json()).id).not.toBe(imported.id);
  const oldRun = await page.request.get(`/api/research/${result.id}`);
  expect(oldRun.ok()).toBeTruthy(); expect((await oldRun.json()).results.some((citation: { quote: string }) => citation.quote === sourceText)).toBe(true);
  const original = await page.request.get(`/api/research/sources/${imported.id}/original`);
  expect(original.ok()).toBeTruthy(); expect(await original.text()).toBe(sourceText);
  await page.goto(legal!.href);
  await expect(page.getByRole("heading", { name: sourceTitle, exact: true })).toBeVisible();
  await expect(page.getByText("Aporte manual sin cotejo oficial", { exact: true })).toBeVisible();
  await expect(page.getByText(sourceText, { exact: true })).toBeVisible();
  await expect(page.getByText(nextSourceText, { exact: true })).toHaveCount(0);
  await captureState("version-anterior", page.locator("#main-content"));
  await page.goto(docCitation!.href);
  await expect(page).toHaveURL(new RegExp(`version=${docCitation!.versionId}.*page=1`));
  await expect(page.getByRole("heading", { name: documentName, exact: true })).toBeVisible();

  await page.goto("/jurisprudencia");
  for (const name of ["Legislación", "Jurisprudencia", "Documentos administrativos"]) await workbench.getByRole("checkbox", { name, exact: true }).uncheck();
  await workbench.locator("#research-query").fill(`${token}ausencia`);
  const abstentionPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/research" && response.request().method() === "POST");
  await workbench.getByRole("button", { name: "Consultar mis fuentes", exact: true }).click();
  const abstention = await (await abstentionPending).json() as ResearchResult;
  expect(abstention.status).toBe("abstained"); expect(abstention.results).toEqual([]); expect(abstention.coverage.legalSourcesAvailable).toBe(0);
  await expect(page.getByRole("heading", { name: "Sin evidencia suficiente", exact: true })).toBeVisible();
  const portalContext = await browser.newContext({ locale: "es-CL" });
  try {
    const portal = await portalContext.newPage(); await loginAs(portal, "cliente@andes.cl");
    expect((await portal.request.get("/api/research")).status()).toBe(403);
    expect((await portal.request.get(`/api/research/${result.id}`)).status()).toBe(403);
    expect((await portal.request.get(`/api/research/sources/${imported.id}/original`)).status()).toBe(403);
  } finally { await portalContext.close(); }
  expect(externalRequests).toEqual([]);
});
