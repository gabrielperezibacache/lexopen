import { test, expect, type Route } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
let ownerId = "", bookId = "", draftId = "", storageKey = "";
let previous: Awaited<ReturnType<typeof db.userBookPreference.findUnique>> = null;
test.afterAll(async () => {
  try {
    if (draftId) await db.libraryWritingDraft.deleteMany({ where: { id: draftId } });
    if (bookId) await db.libraryBook.deleteMany({ where: { id: bookId } });
    if (ownerId) { await db.userBookPreference.deleteMany({ where: { userId: ownerId } }); if (previous) await db.userBookPreference.create({ data: previous }); }
    await db.auditEvent.deleteMany({ where: { entityId: { in: [bookId, draftId, ownerId].filter(Boolean) }, OR: [{ action: { startsWith: "books." } }, { action: { startsWith: "library." } }] } });
    if (storageKey) await rm(path.join(process.env.STORAGE_PATH || "storage", storageKey), { force: true });
  } finally { await db.$disconnect(); }
});

test("conversión opcional: aviso de peso, OCR, texto retenido y citas sin afirmar original", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await loginAs(page, "abogado@estudio.cl"); const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } }); ownerId = owner.id; previous = await db.userBookPreference.findUnique({ where: { userId: owner.id } });
  // Force the old defaults to differ from the saved choice, independently of earlier tests.
  const baseline = await page.request.patch("/api/books/preferences", { data: { defaultConvertToText: false, defaultPreserveOriginal: true } });
  expect(baseline.status(), await baseline.text()).toBe(200);
  await page.goto("/biblioteca"); await page.getByRole("button", { name: "Personalizar biblioteca", exact: true }).click();
  await expect(page.locator('input[name="defaultConvertToText"]')).not.toBeChecked();
  await expect(page.locator('input[name="defaultPreserveOriginal"]')).toBeChecked();
  await page.locator('input[name="defaultPreserveOriginal"]').uncheck();
  await expect(page.locator('input[name="defaultConvertToText"]')).toBeChecked();
  await page.locator('input[name="heavyFileThresholdMb"]').fill("1");
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`conversion-preferences-${name}.png`), fullPage: true });
  }
  let heldBooksGet = false;
  let releaseBooksGet!: () => void;
  let finishHeldBooksGet!: () => void;
  const booksGetGate = new Promise<void>(resolve => { releaseBooksGet = resolve; });
  const heldBooksGetFinished = new Promise<void>(resolve => { finishHeldBooksGet = resolve; });
  const booksUrl = (url: URL) => url.pathname === "/api/books";
  const holdBooksGet = async (route: Route) => {
    if (route.request().method() === "GET" && !heldBooksGet) {
      heldBooksGet = true;
      try {
        await booksGetGate;
        await route.continue();
      } finally { finishHeldBooksGet(); }
      return;
    }
    await route.continue();
  };
  await page.route(booksUrl, holdBooksGet);
  try {
    const savingPreferences = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books/preferences" && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Guardar mi biblioteca", exact: true }).click();
    const savedPreferences = await savingPreferences;
    expect(savedPreferences.status(), await savedPreferences.text()).toBe(200);
    await expect.poll(() => heldBooksGet).toBe(true);
    await expect(page.getByRole("heading", { name: "Tu biblioteca, a tu manera", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Añadir libros", exact: true }).click();
    // The follow-up GET is still held: importing must already use the successful PATCH result.
    await expect(page.getByTestId("import-convert-text")).toBeChecked();
    await expect(page.getByTestId("import-preserve-original")).not.toBeChecked();
  } finally {
    releaseBooksGet();
    if (heldBooksGet) await heldBooksGetFinished;
    await page.unroute(booksUrl, holdBooksGet);
  }
  await page.locator('input[name="files"]').setInputFiles({ name: "archivo-pesado-ficticio.txt", mimeType: "text/plain", buffer: Buffer.alloc(1_200_000, "a") });
  await expect(page.getByTestId("book-heavy-warning")).toBeVisible();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`conversion-options-${name}.png`), fullPage: true });
  }
  const fixture = "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf", originalBytes = await readFile(fixture);
  await page.locator('input[name="files"]').setInputFiles({ name: "conversion-ocr-ficticia.pdf", mimeType: "application/pdf", buffer: originalBytes });
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Incorporar a mi biblioteca", exact: true }).click();
  const imported = await pending; expect(imported.status(), await imported.text()).toBe(201); const book = (await imported.json()).book; bookId = book.id;
  storageKey = (await db.libraryBook.findUniqueOrThrow({ where: { id: bookId } })).storageKey;
  expect(book.originalRetained).toBe(false); expect(book.convertedToText).toBe(true); expect(book.locatorKind).toBe("converted-text"); expect(book.pageCount).toBeNull(); expect(book.retainedBytes).toBeLessThan(book.originalBytes);
  expect((await page.request.get(`/api/books/${bookId}/original`)).status()).toBe(410);
  const text = await page.request.get(`/api/books/${bookId}/text`); expect(text.status()).toBe(200); expect(createHash("sha256").update(await text.body()).digest("hex")).toBe(book.retainedSha256);
  expect(await readFile(fixture)).toEqual(originalBytes);
  await page.goto(`/biblioteca/${bookId}`); await expect(page.getByTestId("book-retained-text-notice")).toBeVisible();
  await expect(page.getByLabel("Página física del PDF", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Descargar original", exact: true })).toHaveCount(0);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`conversion-reader-${name}.png`), fullPage: true });
  }
  const search = await page.request.post("/api/books/search", { data: { query: "pago", bookIds: [bookId] } }); expect(search.status()).toBe(200); const citation = (await search.json()).results[0];
  expect(citation.verificationBasis).toBe("retained_text"); expect(citation.retainedSha256).toBe(book.retainedSha256); expect(citation.pageNumber).toBeNull(); expect(citation.locatorLabel).toContain("Texto retenido");
  const created = await page.request.post("/api/books/drafts", { data: { requestId: randomUUID(), title: "Escrito ficticio convertido", query: "pago", instruction: "Reunir el pasaje ficticio", bookIds: [bookId], mode: "extractive" } }); expect(created.status(), await created.text()).toBe(201); const draft = (await created.json()).draft; draftId = draft.id;
  const exported = await page.request.get(`/api/books/drafts/${draftId}/export?format=txt`); expect(exported.status()).toBe(200); const content = await exported.text(); expect(content).toContain("Texto conservado SHA-256:"); expect(content).toContain("Original no conservado");
});
