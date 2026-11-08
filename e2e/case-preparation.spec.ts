import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import { loginAs, authenticateApiRequests } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Preparation browser fixtures require local storage");
const tag = randomUUID();
const sourcePrefix = `case-preparation-browser/${tag}`;
const storageRoot = path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
const email = `preparacion-${tag}@example.test`;
const publicText = "El pago del arriendo se realizó el 12 de mayo de 2025 por CLP25.000.";
const restrictedText = "La firma del convenio reservado consta el 03/04/2025 por CLP45.000.";
let ownerId = "", causaId = "", restrictedDocumentId = "";
const documentIds: string[] = [];

test.beforeAll(async () => {
  const template = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true, id: true } });
  // Isolate permission changes from the seed users used by the other browser tests.
  const owner = await db.user.create({ data: { email, name: "Profesional ficticio de preparación", role: "abogado", password: template.password } });
  ownerId = owner.id;
  causaId = (await db.causa.create({ data: { titulo: `Preparación ficticia ${tag}`, tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  for (const [index, text] of [publicText, restrictedText].entries()) {
    const key = `${sourcePrefix}/source-${index}.txt`;
    await putObject({ key, body: text, contentType: "text/plain" });
    const document = await db.documento.create({ data: { nombre: `${index ? "Convenio reservado ficticio" : "Constancia de pago ficticia"} ${tag}.txt`, mimeType: "text/plain", storageKey: key, contenido: text, extractedMarkdown: text, extractionStatus: "completed", causaId, autorId: ownerId } });
    documentIds.push(document.id);
    if (index) restrictedDocumentId = document.id;
  }
  await db.hearingWorkspace.createMany({ data: [
    { causaId, ownerId, title: "Mesa privada del profesional ficticio" },
    { causaId, ownerId: template.id, title: "Mesa privada de otro profesional" },
  ] });
  for (const confidencial of [false, true]) {
    await db.minuta.create({ data: { causaId, autorId: ownerId, confidencial, titulo: confidencial ? "Minuta reservada ficticia" : "Minuta pública ficticia", resumenEjecutivo: "Registro ficticio para comprobar la continuidad del expediente.", acciones: { create: { descripcion: confidencial ? "Acción reservada ficticia" : "Acción pública ficticia", estado: "pendiente" } } } });
  }
});

test.afterAll(async () => {
  try {
    if (causaId) {
      await db.hearingWorkspace.deleteMany({ where: { causaId } });
      await db.caseFact.deleteMany({ where: { causaId } });
      await db.causa.deleteMany({ where: { id: causaId } });
    }
    if (documentIds.length) await db.documento.deleteMany({ where: { id: { in: documentIds } } });
    if (ownerId) {
      await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    }
    await rm(path.join(storageRoot, sourcePrefix), { recursive: true, force: true });
    for (const id of documentIds) await rm(path.join(storageRoot, "evidence", encodeURIComponent(id)), { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});

test("preparación integrada: índice, hoja con citas, incertidumbre y permisos al descargar", async ({ page }, info) => {
  test.setTimeout(150_000);
  await loginAs(page, email);
  await authenticateApiRequests(page);
  for (const id of documentIds) {
    const response = await page.request.post(`/api/documentos/${id}/evidence`);
    expect(response.status(), await response.text()).toBe(201);
  }
  const analyzed = await page.request.post(`/api/causas/${causaId}/knowledge/analyze`, { data: {} });
  expect(analyzed.ok(), await analyzed.text()).toBeTruthy();
  expect((await analyzed.json()).newFacts).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/causas/${causaId}`);
  const preparation = page.getByTestId("case-preparation");
  await expect(preparation.getByRole("heading", { name: "Preparar la causa", exact: true })).toBeVisible();
  await expect(preparation.locator(".case-preparation-steps > li")).toHaveCount(5);
  await expect(preparation).toContainText("2 documentos · 2 con texto");
  await expect(preparation).toContainText("1 mesa privada de tu propiedad");
  await expect(preparation).toContainText("2 minutas accesibles · 2 acciones abiertas");
  const draft = preparation.getByRole("link", { name: "Escribir con fuentes" });
  await expect(draft).toHaveAttribute("href", `/causas/${causaId}/escritos`);
  await page.getByText("Ir a una sección del expediente", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Índice del expediente", exact: true });
  for (const [mode, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
    await page.setViewportSize(viewport);
    for (const link of await navigation.getByRole("link").all()) {
      const target = await link.getAttribute("href");
      expect(target).toMatch(/^#/);
      await expect(page.locator(target!)).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await preparation.evaluate(element => { (document.activeElement as HTMLElement)?.blur(); element.scrollIntoView({ block: "start", behavior: "instant" }); });
    await page.screenshot({ path: info.outputPath(`preparation-${mode}.png`), animations: "disabled" });
    await preparation.getByRole("link", { name: "Revisar documentos", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/causas/${causaId}#documentos$`));
    await expect.poll(() => page.locator("#documentos").evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(80);
    await expect.poll(() => page.locator("#documentos").evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(180);
  }
  await navigation.getByRole("link", { name: "Hechos y fuentes", exact: true }).click();
  const knowledge = page.locator("#conocimiento");
  await knowledge.getByRole("button", { name: "Abrir conocimiento del expediente", exact: true }).click();
  await expect(knowledge.getByTestId("case-fact")).toHaveCount(2);
  await knowledge.getByText("Llevar los hechos al escrito", { exact: true }).click();
  for (const [mode, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
    await page.setViewportSize(viewport);
    const exportPanel = knowledge.locator("details").filter({ has: page.locator("summary", { hasText: "Llevar los hechos al escrito" }) });
    await expect(exportPanel.getByRole("button", { name: "Descargar hoja de preparación", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await exportPanel.evaluate(element => { (document.activeElement as HTMLElement)?.blur(); element.scrollIntoView({ block: "center", behavior: "instant" }); });
    await page.screenshot({ path: info.outputPath(`preparation-export-${mode}.png`), animations: "disabled" });
  }
  const pendingMarkdown = page.waitForEvent("download");
  await knowledge.getByRole("button", { name: "Descargar hoja de preparación", exact: true }).click();
  const markdownFile = await pendingMarkdown;
  expect(markdownFile.suggestedFilename()).toBe("lexopen-preparacion.md");
  const markdown = await readFile((await markdownFile.path())!, "utf8");
  expect(markdown).toContain("# Hoja de preparación de la causa");
  expect(markdown).toContain(publicText);
  expect(markdown).toContain(restrictedText);
  expect(markdown).toContain("## Alcance y revisión");
  expect(markdown).toContain("No es un inventario completo ni una conclusión judicial.");
  expect(markdown).toContain("SHA-256 de la cita");
  expect(markdown).toContain("03/04/2025");
  expect(markdown).toContain("Sin fecha normalizada");

  const pendingCsv = page.waitForEvent("download");
  await knowledge.getByRole("button", { name: "Descargar cronología CSV", exact: true }).click();
  const csvFile = await pendingCsv;
  expect(csvFile.suggestedFilename()).toBe("lexopen-cronologia.csv");
  const csv = await readFile((await csvFile.path())!, "utf8");
  expect(csv).toContain("Fecha literal");
  expect(csv).toContain("Cita literal");
  expect(csv).toContain("Ambigua");
  expect(csv).toContain("03/04/2025");
  expect(csv).toContain(restrictedText);
  expect(csv).toContain("Alcance");

  // The open panel holds an older snapshot: downloads must check permissions again.
  const previous = await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { capabilityRevokes: true } });
  try {
    await db.documento.update({ where: { id: restrictedDocumentId }, data: { confidencial: true } });
    await db.user.update({ where: { id: ownerId }, data: { capabilityRevokes: "doc.confidential.read" } });
    const pendingRevoked = page.waitForEvent("download");
    await knowledge.getByRole("button", { name: "Descargar hoja de preparación", exact: true }).click();
    const revokedFile = await pendingRevoked;
    const revoked = await readFile((await revokedFile.path())!, "utf8");
    expect(revoked).toContain(publicText);
    expect(revoked).not.toContain(restrictedText);
    expect(revoked).not.toContain("Convenio reservado ficticio");
    expect(revoked).not.toContain("03/04/2025");
    expect(revoked).toContain("Se omitió conocimiento cuya evidencia ya no está disponible o autorizada.");
    const revokedCsvResponse = await page.request.get(`/api/causas/${causaId}/knowledge/export?format=csv`);
    expect(revokedCsvResponse.ok(), await revokedCsvResponse.text()).toBeTruthy();
    const revokedCsv = await revokedCsvResponse.text();
    expect(revokedCsv).toContain(publicText);
    expect(revokedCsv).not.toContain(restrictedText);
    expect(revokedCsv).not.toContain("Convenio reservado ficticio");
    await page.reload();
    await expect(preparation).toContainText("1 documento · 1 con texto");
    await expect(preparation).toContainText("1 minuta accesible · 1 acción abierta");
    await expect(page.getByText("Minuta reservada ficticia", { exact: true })).toHaveCount(0);
  } finally {
    await db.user.update({ where: { id: ownerId }, data: { capabilityRevokes: previous.capabilityRevokes } });
    await db.documento.update({ where: { id: restrictedDocumentId }, data: { confidencial: false } });
  }
});
