import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import type { CaseFactView } from "../src/lib/knowledge/cases";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Case knowledge browser fixtures require local storage");
const tag = randomUUID(), sourcePrefix = `case-knowledge-browser/${tag}`;
const storageRoot = path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
let ownerId = "", otherId = "", caseId = "", pdfId = "", aId = "", bId = "";
const pdfName = `PDF de hechos ficticios ${tag}.pdf`;
const textA = "El pago del arriendo se realizó el 12 de mayo de 2025 por CLP25.000. La firma consta el 03/04/2025.";
const textB = "El pago del arriendo se realizó el 12 de mayo de 2025 por CLP35.000.";

test.beforeAll(async () => {
  ownerId = (await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } })).id;
  otherId = (await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } })).id;
  caseId = (await db.causa.create({ data: { titulo: `Conocimiento ficticio ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  const pdf = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
  const key = `${sourcePrefix}/original.pdf`; await putObject({ key, body: pdf, contentType: "application/pdf" });
  pdfId = (await db.documento.create({ data: { nombre: pdfName, mimeType: "application/pdf", storageKey: key, extractionStatus: "completed", causaId: caseId, autorId: ownerId } })).id;
  for (const [index, text] of [textA, textB].entries()) {
    const key = `${sourcePrefix}/source-${index}.txt`; await putObject({ key, body: text, contentType: "text/plain" });
    const id = (await db.documento.create({ data: { nombre: `Fuente de pago ${index + 1} ${tag}.txt`, mimeType: "text/plain", storageKey: key, contenido: text, extractedMarkdown: text, extractionStatus: "completed", causaId: caseId, autorId: ownerId } })).id;
    if (index === 0) aId = id; else bId = id;
  }
});
test.afterAll(async () => {
  try {
    const [facts, conflicts] = await Promise.all([db.caseFact.findMany({ where: { causaId: caseId || "__none__" }, select: { id: true } }), db.caseConflict.findMany({ where: { causaId: caseId || "__none__" }, select: { id: true } })]);
    await db.auditEvent.deleteMany({ where: { entityId: { in: [caseId, pdfId, aId, bId, ...facts.map(fact => fact.id), ...conflicts.map(conflict => conflict.id)].filter(Boolean) } } });
    if (caseId) { await db.caseFact.deleteMany({ where: { causaId: caseId } }); await db.causa.deleteMany({ where: { id: caseId } }); }
    await db.documento.deleteMany({ where: { id: { in: [pdfId, aId, bId].filter(Boolean) } } });
    await rm(path.join(storageRoot, sourcePrefix), { recursive: true, force: true });
    for (const id of [pdfId, aId, bId].filter(Boolean)) await rm(path.join(storageRoot, "evidence", encodeURIComponent(id)), { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});

test("hechos y cronología: revisión humana, dos citas, ambigüedad y revocación", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await loginAs(page, "abogado@estudio.cl");
  for (const id of [pdfId, aId, bId]) { const response = await page.request.post(`/api/documentos/${id}/evidence`); expect(response.status(), await response.text()).toBe(201); }
  await page.goto(`/causas/${caseId}#conocimiento`);
  const panel = page.locator("#conocimiento");
  await panel.getByRole("button", { name: "Abrir conocimiento del expediente", exact: true }).click();
  const pendingAnalysis = page.waitForResponse(response => new URL(response.url()).pathname === `/api/causas/${caseId}/knowledge/analyze` && response.request().method() === "POST");
  await panel.getByRole("button", { name: "Proponer hechos desde fuentes", exact: true }).click();
  const analysis = await pendingAnalysis; expect(analysis.ok(), await analysis.text()).toBeTruthy();
  const payload = await (await page.request.get(`/api/causas/${caseId}/knowledge`)).json();
  const facts = payload.facts as CaseFactView[];
  const factA = facts.find(fact => fact.citations.some(citation => citation.documentId === aId) && fact.statement.includes("CLP25.000"))!;
  const factB = facts.find(fact => fact.citations.some(citation => citation.documentId === bId))!;
  const pdfFact = facts.find(fact => fact.citations.some(citation => citation.documentId === pdfId && citation.pageNumber === 2))!;
  expect(factA).toBeTruthy(); expect(factB).toBeTruthy(); expect(pdfFact).toBeTruthy();
  expect(facts.some(fact => fact.datePrecision === "ambiguous" && fact.dateStart === null)).toBe(true);
  await expect(panel.getByRole("heading", { name: "Hechos, cronología y contradicciones", exact: true })).toBeVisible();
  const article = panel.locator(`[data-fact-id="${factA.id}"]`);
  await article.getByRole("button", { name: "Revisar hecho", exact: true }).click();
  await panel.getByRole("combobox", { name: /^Estado de revisión/ }).selectOption("accepted");
  await panel.getByLabel("Motivo de la revisión", { exact: true }).fill("Cotejo humano de la fecha y el importe citados.");
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/causas/${caseId}/knowledge/facts/${factA.id}` && response.request().method() === "PATCH");
  await panel.getByRole("button", { name: "Guardar revisión", exact: true }).click(); expect((await saved).ok()).toBeTruthy();
  const currentA = await (await page.request.get(`/api/causas/${caseId}/knowledge/facts/${factA.id}`)).json(); expect(currentA.status).toBe("accepted");
  await article.getByRole("button", { name: "Ver historial", exact: true }).click();
  await expect(panel.getByText("Cotejo humano de la fecha y el importe citados.", { exact: false })).toBeVisible();
  await expect(article.getByText("Estado: Propuesto → Revisado", { exact: true })).toBeVisible();
  await expect(article.getByText(/^Fecha antes:/)).toContainText("12-05-2025");
  await expect(article.getByText(/^Fecha después:/)).toContainText("12-05-2025");
  const popup = page.context().waitForEvent("page"); await panel.locator(`[data-fact-id="${pdfFact.id}"]`).locator('a[href*="page=2"]').first().click(); const source = await popup;
  await expect(source).toHaveURL(new RegExp(`version=.*page=2`)); await expect(source.getByRole("heading", { name: pdfName, exact: true })).toBeVisible(); await expect(source.getByRole("img", { name: `Página 2 de ${pdfName}`, exact: true })).toBeVisible(); await source.close();
  const capture = async (name: string, target = panel) => { for (const [mode, width, height] of [["desktop", 1366, 900], ["mobile", 360, 800]] as const) { await page.setViewportSize({ width, height }); await target.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await target.screenshot({ path: testInfo.outputPath(`knowledge-${name}-${mode}.png`) }); } };
  await capture("facts");
  await capture("history", article);
  await panel.getByRole("button", { name: "Cronología", exact: true }).click(); await expect(panel.getByRole("heading", { name: "Sin fecha normalizada", exact: true })).toBeVisible(); await expect(panel.getByText("03/04/2025", { exact: false }).first()).toBeVisible(); await capture("chronology");
  for (const [id, revision] of [[factA.id, currentA.revision], [factB.id, factB.revision]] as const) { const response = await page.request.patch(`/api/causas/${caseId}/knowledge/facts/${id}`, { data: { revision, comparisonKey: "pago-arriendo-mayo", reason: "Se vincula el mismo pago para contraste de las dos fuentes." } }); expect(response.ok(), await response.text()).toBeTruthy(); }
  const compared = await page.request.post(`/api/causas/${caseId}/knowledge/analyze`, { data: {} }); expect(compared.ok(), await compared.text()).toBeTruthy(); expect((await compared.json()).newConflicts).toBeGreaterThan(0);
  await page.reload(); await panel.getByRole("button", { name: "Abrir conocimiento del expediente", exact: true }).click(); await panel.getByRole("button", { name: "Contradicciones", exact: true }).click();
  await expect(panel.getByText(/CLP25\.000/).first()).toBeVisible(); await expect(panel.getByText(/CLP35\.000/).first()).toBeVisible();
  const comparison = (await (await page.request.get(`/api/causas/${caseId}/knowledge`)).json()).conflicts[0];
  const conflictArticle = panel.getByTestId("case-conflict").first();
  await conflictArticle.getByRole("combobox", { name: /^Decisión sobre la contradicción/ }).selectOption("confirmed");
  await conflictArticle.getByRole("textbox", { name: /^Explicación de la incompatibilidad/ }).fill("Borrador local anterior que no debe reutilizarse con una revisión nueva.");
  const nextReason = "Se mantiene como discrepancia aparente hasta aclarar si los importes corresponden al mismo pago.";
  const updated = await page.request.patch(`/api/causas/${caseId}/knowledge/conflicts/${comparison.id}`, { data: { revision: comparison.revision, status: "apparent", reason: nextReason, reviewReason: "Revisión humana del contraste" } }); expect(updated.ok()).toBeTruthy();
  const staleAttempt = await page.request.patch(`/api/causas/${caseId}/knowledge/conflicts/${comparison.id}`, { data: { revision: comparison.revision, status: "confirmed", reason: "Un estado antiguo no puede reemplazar la revisión nueva de la comparación.", reviewReason: "Intento con revisión vencida" } }); expect(staleAttempt.status()).toBe(409);
  await panel.getByRole("button", { name: "Actualizar conocimiento", exact: true }).click();
  await expect(conflictArticle.getByRole("combobox", { name: /^Decisión sobre la contradicción/ })).toHaveValue("apparent");
  await expect(conflictArticle.getByRole("textbox", { name: /^Explicación de la incompatibilidad/ })).toHaveValue(nextReason);
  await expect(conflictArticle.getByRole("textbox", { name: /^Motivo de la decisión/ })).toHaveValue("");
  await capture("conflicts");
  const portal = await browser.newContext({ locale: "es-CL" });
  try { const client = await portal.newPage(); await loginAs(client, "cliente@andes.cl"); expect((await client.request.get(`/api/causas/${caseId}/knowledge`)).status()).toBe(403); } finally { await portal.close(); }
  await db.causa.update({ where: { id: caseId }, data: { abogadoId: otherId } });
  expect((await page.request.get(`/api/causas/${caseId}/knowledge`)).status()).toBe(404);
  expect((await page.request.get(`/api/causas/${caseId}/knowledge/facts/${factA.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/causas/${caseId}/knowledge/conflicts/${comparison.id}`)).status()).toBe(404);
});
