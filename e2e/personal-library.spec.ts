import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID(), ids: string[] = [], draftIds: string[] = [], collectionIds: string[] = [], keys: string[] = [];
let ownerId = "";
let previousPreference: Awaited<ReturnType<typeof db.userBookPreference.findUnique>> = null;
test.afterAll(async () => {
  try {
    if (draftIds.length) await db.libraryWritingDraft.deleteMany({ where: { id: { in: draftIds } } });
    if (collectionIds.length) await db.bookShelfCollection.deleteMany({ where: { id: { in: collectionIds } } });
    if (ids.length) await db.libraryBook.deleteMany({ where: { id: { in: ids } } });
    if (ownerId) {
      await db.userBookPreference.deleteMany({ where: { userId: ownerId } });
      if (previousPreference) await db.userBookPreference.create({ data: previousPreference });
    }
    await db.auditEvent.deleteMany({ where: { entityId: { in: [...ids, ...draftIds, ...collectionIds, ownerId].filter(Boolean) }, action: { startsWith: "library." } } });
    await db.auditEvent.deleteMany({ where: { entityId: { in: draftIds }, action: { startsWith: "books." } } });
    await Promise.all(keys.map(key => rm(path.join(process.env.STORAGE_PATH || "storage", key), { force: true })));
  } finally { await db.$disconnect(); }
});

test("biblioteca personal: libros propios, seis distribuciones, pasajes, escrito y revocación compartida", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await loginAs(page, "abogado@estudio.cl");
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } }); ownerId = owner.id;
  const recipient = await db.user.findUniqueOrThrow({ where: { email: "asistente@estudio.cl" } });
  previousPreference = await db.userBookPreference.findUnique({ where: { userId: ownerId } });
  await page.goto("/biblioteca");
  await expect(page.getByTestId("personal-law-library")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu primer libro tiene su lugar." })).toBeVisible();
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await page.screenshot({ path: testInfo.outputPath(`books-empty-${name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Añadir libros", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("src/lib/books/fixtures/juridical-fixture.txt");
  const pendingImport = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Incorporar a mi biblioteca", exact: true }).click();
  const imported = await pendingImport; expect(imported.status(), await imported.text()).toBe(201);
  const textBook = (await imported.json()).book; ids.push(textBook.id);
  for (const [extension, title, color] of [["epub", "Manual ficticio de obligaciones", "forest"], ["docx", "Apuntes ficticios de contratos", "navy"], ["pdf", "Prueba documental ficticia", "cognac"]]) {
    const fixture = extension === "pdf" ? "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf" : `src/lib/books/fixtures/juridical-fixture.${extension}`;
    const response = await page.request.post("/api/books", { multipart: { requestId: randomUUID(), title, author: "Autor ficticio para pruebas", year: "2026", shelf: "Colección ficticia de prueba", coverColor: color, file: { name: `fixture.${extension}`, mimeType: "application/octet-stream", buffer: await readFile(fixture) } } });
    expect(response.status(), await response.text()).toBe(201); ids.push((await response.json()).book.id);
  }
  const rows = await db.libraryBook.findMany({ where: { id: { in: ids } }, select: { storageKey: true } }); keys.push(...rows.map(row => row.storageKey));
  await page.reload(); await expect(page.getByTestId("library-book")).toHaveCount(4);
  await page.getByRole("button", { name: "Personalizar biblioteca", exact: true }).click();
  await page.getByLabel("Nombre de mi biblioteca").fill("Biblioteca de prueba de LexOpen");
  await page.getByLabel("Material del estante").selectOption("walnut");
  await page.locator('input[name="layout"][value="estantes"]').check();
  await page.getByRole("button", { name: "Guardar mi biblioteca", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Biblioteca de prueba de LexOpen", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByTestId("personal-law-library")).toHaveAttribute("data-layout", "estantes");
  for (const layout of ["mesa", "estantes", "gabinete", "galeria", "archivo", "salon"]) {
    const pref = await page.request.patch("/api/books/preferences", { data: { libraryName: "Biblioteca de prueba de LexOpen", shelfTheme: layout === "archivo" ? "night" : layout === "salon" ? "oak" : "walnut", view: "covers", layout } }); expect(pref.status()).toBe(200);
    await page.reload(); await expect(page.getByTestId("library-book")).toHaveCount(4);
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`books-${layout}-${name}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("library-book").getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Mesa de escritura", exact: false }).first().click();
  await page.locator(".book-source-choice").filter({ hasText: textBook.title }).getByRole("checkbox").check();
  await page.getByLabel("Qué necesitas fundamentar", { exact: true }).fill("buena fe contrato");
  await page.getByRole("button", { name: "Buscar pasajes", exact: true }).click();
  await expect(page.locator(".book-search-results")).toContainText("material ficticio");
  await page.getByText("Preparar un escrito", { exact: true }).click();
  await page.getByLabel("Título del escrito", { exact: true }).fill("Fundamento ficticio para prueba");
  await page.getByLabel("Texto que ya has escrito", { exact: true }).fill("Texto propio ficticio que debe conservarse.");
  const createPending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books/drafts" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Crear borrador con citas", exact: true }).click();
  const created = await createPending; expect(created.status(), await created.text()).toBe(201); const draft = (await created.json()).draft; draftIds.push(draft.id);
  await expect(page.getByLabel("Texto del borrador", { exact: true })).toHaveValue(/Texto propio ficticio/);
  // Switching library sections keeps the live desk, including unsaved prose and inputs.
  const prose = page.getByLabel("Texto del borrador", { exact: true });
  const pendingProse = `${draft.prose}\n\nObservación propia pendiente de guardar.`;
  await prose.fill(pendingProse);
  await page.getByRole("button", { name: "Mis libros", exact: true }).click();
  await page.getByRole("button", { name: "Mesa de escritura", exact: false }).first().click();
  await expect(prose).toHaveValue(pendingProse);
  await expect(page.locator(".book-desk-session")).toContainText("Cambios sin guardar");
  await expect(page.getByLabel("Qué necesitas fundamentar", { exact: true })).toHaveValue("buena fe contrato");
  // A failed catalog refresh hides stale material without unmounting the local draft.
  await page.getByRole("button", { name: "Personalizar biblioteca", exact: true }).click();
  await page.route("**/api/books", async route => { if (route.request().method() === "GET") await route.abort("failed"); else await route.continue(); });
  await page.getByRole("button", { name: "Guardar mi biblioteca", exact: true }).click();
  await expect(page.locator(".book-error[role=alert]")).toContainText("El material queda oculto");
  await expect(prose).not.toBeVisible();
  await page.unroute("**/api/books");
  await page.getByRole("button", { name: "Volver a cargar biblioteca", exact: true }).click();
  await expect(prose).toBeVisible();
  await expect(prose).toHaveValue(pendingProse);
  for (const action of [page.getByRole("button", { name: "Crear borrador con citas", exact: true }), page.locator(".book-draft-history button").first(), page.locator(".book-draft-references .book-source-link").first()]) {
    page.once("dialog", dialog => dialog.dismiss());
    await action.click();
    await expect(prose).toHaveValue(pendingProse);
  }
  // A late response cannot overwrite keystrokes: the editor is locked until the save resolves.
  let releaseSave!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  const draftRoute = `**/api/books/drafts/${draft.id}`;
  await page.route(draftRoute, async route => { if (route.request().method() === "PATCH") await saveGate; await route.continue(); });
  await page.getByRole("button", { name: "Guardar escrito", exact: true }).click();
  await expect(prose).toBeDisabled();
  await expect(page.getByLabel("Título guardado", { exact: true })).toBeDisabled();
  await expect(page.locator(".book-desk-session")).toContainText("Guardando el escrito");
  releaseSave();
  await expect(prose).toBeEnabled();
  await expect(prose).toHaveValue(pendingProse);
  await expect(page.locator(".book-desk-session")).toContainText("Guardado · revisión 2");
  await page.unroute(draftRoute);
  // A failed save retains the exact local text and exposes an explicit retry.
  const recoveredProse = `${pendingProse}\n\nSegunda observación para reintentar.`;
  await prose.fill(recoveredProse);
  await page.route(draftRoute, async route => { if (route.request().method() === "PATCH") await route.abort("failed"); else await route.continue(); });
  await page.getByRole("button", { name: "Guardar escrito", exact: true }).click();
  await expect(page.locator(".book-error[role=alert]")).toContainText("Tu texto sigue en esta mesa");
  await expect(prose).toHaveValue(recoveredProse);
  await page.unroute(draftRoute);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.locator(".book-desk-session")).toContainText("Guardado · revisión 3");
  await expect(prose).toHaveValue(recoveredProse);
  const exported = await page.request.get(`/api/books/drafts/${draft.id}/export?format=txt`); expect(exported.status()).toBe(200); expect(await exported.text()).toContain("Original SHA-256:");
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`books-writing-${name}.png`), fullPage: true });
  }
  const epub = await page.request.get(`/api/books/${ids[1]}`); const epubData = await epub.json(); expect(epubData.book.locatorKind).toBe("epub-section"); expect(epubData.fragments[0].text).toContain("buena fe"); expect(epubData.fragments[0].pageNumber).toBeNull();
  const pdf = await page.request.get(`/api/books/${ids[3]}?page=2`); const pdfData = await pdf.json(); expect(pdfData.fragments[0].pageNumber).toBe(2);
  const verified = await page.request.post("/api/books/citations/verify", { data: { citation: { bookId: ids[3], fragmentId: pdfData.fragments[0].id, quote: pdfData.fragments[0].text } } }); expect(verified.status()).toBe(200); const pdfCitation = (await verified.json()).citation; expect(pdfCitation.pageNumber).toBe(2);
  await page.goto(pdfCitation.href);
  const readerPanel = page.locator("dialog.context-panel");
  await expect(readerPanel).toBeVisible();
  await expect(readerPanel).toHaveAttribute("aria-modal", "true");
  await expect(readerPanel.locator("blockquote").first()).toHaveText(pdfData.fragments[0].text);
  await expect(readerPanel.getByRole("button", { name: "Verificar y copiar cita", exact: true }).first()).toBeVisible();
  const verifiedInReader = page.waitForResponse(response => new URL(response.url()).pathname === "/api/books/citations/verify" && response.request().method() === "POST");
  await readerPanel.getByRole("button", { name: "Verificar y copiar cita", exact: true }).first().click();
  const readerVerification = await verifiedInReader;
  expect(readerVerification.status(), await readerVerification.text()).toBe(200);
  expect((await readerVerification.json()).citation.sourceKey).toBe(pdfCitation.sourceKey);
  await readerPanel.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(readerPanel).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Prueba documental ficticia", exact: true })).toBeVisible();
  await expect(page.getByLabel("Página física del PDF", { exact: true })).toHaveValue("2");
  const physicalImage = page.getByRole("img", { name: "Página física 2 de Prueba documental ficticia", exact: true });
  await page.getByLabel("Página física del PDF", { exact: true }).selectOption("1");
  await page.getByLabel("Página física del PDF", { exact: true }).selectOption("2");
  await expect(page).toHaveURL(/pagina=2/);
  await page.reload();
  await expect(page.getByLabel("Página física del PDF", { exact: true })).toHaveValue("2");
  await page.locator(".book-reading-actions").getByRole("button", { name: "Pasajes y citas", exact: true }).click();
  await expect(readerPanel.locator("blockquote").first()).toHaveText(pdfData.fragments[0].text);
  await page.keyboard.press("Escape");
  await expect(readerPanel).not.toBeVisible();
  await expect(page.getByLabel("Página física del PDF", { exact: true })).toHaveValue("2");
  await physicalImage.scrollIntoViewIfNeeded();
  await expect.poll(() => physicalImage.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`books-reader-${name}.png`), fullPage: true });
  }
  await page.getByRole("link", { name: "Llevar este libro a la mesa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu mesa de escritura", exact: true })).toBeVisible();
  await expect(page.locator(".book-source-choice").filter({ hasText: "Prueba documental ficticia" }).getByRole("checkbox")).toBeChecked();
  const collectionResponse = await page.request.post("/api/books/collections", { data: { name: `Prueba compartida ${tag}` } }); expect(collectionResponse.status()).toBe(201); let collection = (await collectionResponse.json()).collection; collectionIds.push(collection.id);
  const shared = await page.request.patch(`/api/books/collections/${collection.id}`, { data: { revision: collection.revision, bookIds: [ids[0]], memberIds: [recipient.id] } }); expect(shared.status()).toBe(200); collection = (await shared.json()).collection;
  const context = await browser.newContext({ locale: "es-CL" });
  try {
    const other = await context.newPage(); await loginAs(other, "asistente@estudio.cl");
    expect((await other.request.get(`/api/books/${ids[0]}`)).status()).toBe(200);
    expect((await other.request.patch(`/api/books/${ids[0]}`, { data: { revision: textBook.revision, title: "No permitido" } })).status()).toBe(404);
    const otherDraft = await other.request.post("/api/books/drafts", { data: { requestId: randomUUID(), title: "Borrador compartido ficticio", query: "buena fe", instruction: "Reunir pasajes de la colección", collectionIds: [collection.id], mode: "extractive" } }); expect(otherDraft.status(), await otherDraft.text()).toBe(201); const dependent = (await otherDraft.json()).draft; draftIds.push(dependent.id);
    await other.goto(`/biblioteca?escribir=${ids[0]}`);
    await other.locator(".book-draft-history button").filter({ hasText: "Borrador compartido ficticio" }).click();
    await expect(other.getByLabel("Texto del borrador", { exact: true })).toBeVisible();
    await other.getByRole("button", { name: "Mis libros", exact: true }).click();
    expect((await page.request.patch(`/api/books/collections/${collection.id}`, { data: { revision: collection.revision, memberIds: [] } })).status()).toBe(200);
    await other.getByRole("button", { name: "Mesa de escritura", exact: false }).first().click();
    await expect(other.locator(".book-protected-draft")).toBeVisible();
    await expect(other.locator(".book-saved-draft")).toHaveCount(0);
    await expect(other.locator(".book-search-results")).toHaveCount(0);
    for (const route of [`/api/books/${ids[0]}`, `/api/books/${ids[0]}/original`, `/api/books/drafts/${dependent.id}`, `/api/books/drafts/${dependent.id}/export?format=txt`]) expect((await other.request.get(route)).status()).toBe(404);
  } finally { await context.close(); }
});
