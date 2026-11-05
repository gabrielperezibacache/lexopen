import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID().slice(0, 8), title = `Sentencia enteramente ficticia ${tag}`, court = `Tribunal ficticio de interfaz ${tag}`;
const officialUrl = `https://judicial-ui-fixture.invalid/resolucion/${tag}`;
let bookId = "", storageKey = "";
test.afterAll(async () => {
  try {
    if (bookId) {
      storageKey ||= (await db.libraryBook.findUnique({ where: { id: bookId }, select: { storageKey: true } }))?.storageKey || "";
      await db.libraryBook.deleteMany({ where: { id: bookId } });
      await db.auditEvent.deleteMany({ where: { entityId: bookId, action: { startsWith: "library." } } });
    }
    if (storageKey) await rm(path.join(process.env.STORAGE_PATH || "storage", storageKey), { force: true });
  } finally { await db.$disconnect(); }
});

async function fillJudicial(page: Page, caseNumber: string, date: string) {
  await page.getByLabel("Tribunal", { exact: true }).fill(court);
  await page.getByLabel("Sala", { exact: true }).fill("Sala ficticia de prueba");
  await page.getByLabel("Rol o número de causa", { exact: true }).fill(caseNumber);
  await page.getByLabel("Fecha de la resolución", { exact: true }).fill(date);
  await page.getByLabel("Carátula", { exact: true }).fill("Parte ficticia A con parte ficticia B");
  await page.getByLabel("Materia", { exact: true }).fill("Prueba ficticia de pago");
  await page.getByLabel("Enlace oficial de procedencia (opcional)", { exact: true }).fill(officialUrl);
}

async function saveSettings(page: Page) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/books/${bookId}` && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Guardar ficha", exact: true }).click();
  const response = await pending; expect(response.status(), await response.text()).toBe(200);
  const result = (await response.json()).book;
  await expect(page.getByRole("heading", { name: "Una edición a tu manera", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Personalizar este libro", exact: true })).toBeVisible();
  await expect(page.locator(".book-reader-information")).toContainText(result.sourceType === "book" ? result.author : result.judicial.caseNumber);
  return result;
}

test("sentencias: ficha manual, TXT privado, cita corroborada y reclasificación sin consultar el enlace declarado", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000); let browserSourceRequests = 0;
  await context.route("https://judicial-ui-fixture.invalid/**", route => { browserSourceRequests++; return route.abort(); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as typeof window & { __judicialCopiedText: string }).__judicialCopiedText = text; } } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/biblioteca?fuentes=judicial");
  const judicialTab = page.getByRole("button", { name: "Sentencias y resoluciones", exact: true });
  await expect(judicialTab).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Añadir libros", exact: true }).click();
  await expect(page.getByLabel("Tipo de fuente", { exact: true })).toHaveValue("judgment");
  await expect(page.getByLabel("Tribunal", { exact: true })).toHaveAttribute("required", "");
  await expect(page.getByLabel("Rol o número de causa", { exact: true })).toHaveAttribute("required", "");
  await expect(page.getByLabel("Fecha de la resolución", { exact: true })).toHaveAttribute("required", "");
  await fillJudicial(page, `J-${tag}`, "2024-02-29");
  const bytes = Buffer.from("Fuente enteramente ficticia para probar LexOpen.\n\nLa prueba del pago requiere antecedentes comprobables. Este texto no representa una sentencia real.");
  await page.locator('input[name="files"]').setInputFiles({ name: `${title}.txt`, mimeType: "text/plain", buffer: bytes });
  await page.getByText("Opciones de importación", { exact: true }).click();
  await page.getByTestId("import-preserve-original").uncheck();
  await expect(page.getByTestId("import-convert-text")).toBeChecked();
  await page.getByText("Opciones de importación", { exact: true }).click();
  await expect(page.locator(".book-conversion-notice")).toContainText("El original no se guardará en LexOpen");
  const pendingImport = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Incorporar a mi biblioteca", exact: true }).click();
  const imported = await pendingImport; expect(imported.status(), await imported.text()).toBe(201);
  const book = (await imported.json()).book; bookId = book.id;
  expect(book.sourceType).toBe("judgment"); expect(book.judicial.court).toBe(court); expect(book.judicial.decisionDate).toBe("2024-02-29");
  expect(book.originalRetained).toBe(false); expect(book.convertedToText).toBe(true); expect(book.pageCount).toBeNull(); expect(book.locatorKind).toBe("converted-text");
  await page.getByRole("button", { name: "Cerrar importación", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar en mis libros", exact: true }).fill(`J-${tag}`);
  const shelfBook = page.locator(`[data-book-id="${bookId}"]`); await expect(shelfBook).toBeVisible(); await expect(shelfBook).toContainText(court);
  await shelfBook.getByRole("link", { name: `Abrir ${title}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.locator(".book-reading-actions").getByRole("button", { name: "Ficha y descargas", exact: true }).click();
  await expect(page.locator(".book-reader-information")).toContainText(`Sentencia. Rol J-${tag}. 29/02/2024`);
  await expect(page.getByRole("link", { name: "Abrir enlace de procedencia declarado", exact: true })).toHaveAttribute("href", officialUrl);
  await expect(page.getByTestId("book-retained-text-notice")).toBeVisible();
  await expect(page.getByLabel("Página física del PDF", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Descargar original", exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/books/${bookId}/original`)).status()).toBe(410);
  const text = await page.request.get(`/api/books/${bookId}/text`); expect(text.status()).toBe(200);
  expect(createHash("sha256").update(await text.body()).digest("hex")).toBe(book.retainedSha256);
  const verifyPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books/citations/verify" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Verificar y copiar cita", exact: true }).first().click();
  const verified = await verifyPending; expect(verified.status(), await verified.text()).toBe(200); const citation = (await verified.json()).citation;
  expect(citation.sourceType).toBe("judgment"); expect(citation.judicial.caseNumber).toBe(`J-${tag}`); expect(citation.verificationBasis).toBe("retained_text"); expect(citation.pageNumber).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __judicialCopiedText?: string }).__judicialCopiedText || "")).toContain(`Rol J-${tag}. 29/02/2024`);
  const copied = await page.evaluate(() => (window as typeof window & { __judicialCopiedText?: string }).__judicialCopiedText || ""); expect(copied).toContain("Cotejada con texto conservado; original no conservado."); expect(copied).toContain(court);
  await page.locator("dialog.context-panel").getByRole("button", { name: "Cerrar", exact: true }).click();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(async () => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }); await page.screenshot({ path: testInfo.outputPath(`judicial-reader-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".book-reading-actions").getByRole("button", { name: "Ficha y descargas", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar este libro", exact: true }).click();
  await page.getByLabel("Tipo de fuente", { exact: true }).selectOption("ruling");
  await page.getByLabel("Rol o número de causa", { exact: true }).fill(`R-${tag}`);
  await page.getByLabel("Fecha de la resolución", { exact: true }).fill("2026-10-31");
  const ruling = await saveSettings(page); expect(ruling.sourceType).toBe("ruling");
  await expect(page.locator(".book-reader-information")).toContainText(`Resolución. Rol R-${tag}. 31/10/2026`);
  await page.getByRole("button", { name: "Personalizar este libro", exact: true }).click();
  await page.getByLabel("Tipo de fuente", { exact: true }).selectOption("book");
  await page.getByLabel("Autor", { exact: true }).fill("Autora ficticia de prueba");
  await page.getByLabel("Edición", { exact: true }).fill("Edición ficticia");
  await page.getByLabel("Editorial", { exact: true }).fill("Editorial ficticia");
  const ordinary = await saveSettings(page); expect(ordinary.sourceType).toBe("book"); expect(ordinary.judicial).toBeNull();
  expect((await db.libraryBook.findUniqueOrThrow({ where: { id: bookId } })).judicialJson).toBe("{}");
  await expect(page.getByRole("link", { name: "Abrir enlace de procedencia declarado", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Personalizar este libro", exact: true }).click();
  await page.getByLabel("Tipo de fuente", { exact: true }).selectOption("judgment");
  await fillJudicial(page, `J2-${tag}`, "2026-11-01");
  const reclassified = await saveSettings(page); expect(reclassified.sourceType).toBe("judgment"); expect(reclassified.author).toBe("Autora ficticia de prueba"); expect(reclassified.edition).toBe("Edición ficticia"); expect(reclassified.publisher).toBe("Editorial ficticia");
  const refreshed = await page.request.post("/api/books/citations/verify", { data: { citation } }); expect(refreshed.status(), await refreshed.text()).toBe(200);
  const refreshedCitation = (await refreshed.json()).citation; expect(refreshedCitation.sourceKey).toBe(citation.sourceKey); expect(refreshedCitation.judicial.caseNumber).toBe(`J2-${tag}`);
  expect(refreshedCitation.judicial.decisionDate).toBe("2026-11-01");
  await page.goto("/biblioteca?fuentes=judicial"); await expect(judicialTab).toHaveAttribute("aria-current", "page");
  await page.getByRole("textbox", { name: "Buscar en mis libros", exact: true }).fill(`J2-${tag}`);
  await expect(page.locator(`[data-book-id="${bookId}"]`)).toBeVisible();
  expect(browserSourceRequests).toBe(0);
});
