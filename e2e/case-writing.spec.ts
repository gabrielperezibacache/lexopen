import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import type { WritingDraftView, WritingHistory, WritingMutationResult } from "../src/lib/writings/types";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Writing fixtures require local storage");
const tag = randomUUID(), prefix = `writing-browser/${tag}`;
const email = `writing-${tag}@example.test`;
const publicText = "El pago del arriendo se realizó el 12 de mayo de 2025 por CLP25.000.";
const bookText = "La buena fe debe observarse durante la ejecución del contrato.";
const noteText = "Solicitar que se exhiba el comprobante original del pago.";
let causaId = "", ownerId = "", documentId = "", bookId = "", bookStorageKey = "", workspaceId = "", factId = "";
let prepared = false;
const base = () => `/api/causas/${causaId}/writings`;

async function json<T>(response: Pick<APIResponse, "status" | "text" | "json">, status = 200): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
async function createDraft(page: Page, title: string, body = "") {
  return (await json<WritingMutationResult>(await page.request.post(base(), { data: { requestId: randomUUID(), title, body } }), 201)).draft;
}
async function current(page: Page, id: string) { return json<WritingDraftView>(await page.request.get(`${base()}/${id}`)); }
async function prepare(page: Page) {
  if (prepared) return;
  await json(await page.request.post(`/api/documentos/${documentId}/evidence`), 201);
  await json(await page.request.post(`/api/causas/${causaId}/knowledge/analyze`, { data: {} }));
  factId = (await db.caseFact.findFirstOrThrow({ where: { causaId }, select: { id: true } })).id;
  const imported = await json<{ book: { id: string } }>(await page.request.post("/api/books", { multipart: { requestId: randomUUID(), title: "Tratado ficticio de contratos", author: "Autora ficticia", preserveOriginal: "true", convertToText: "false", file: { name: "contratos-ficticios.txt", mimeType: "text/plain", buffer: Buffer.from(bookText) } } }), 201);
  bookId = imported.book.id;
  bookStorageKey = (await db.libraryBook.findUniqueOrThrow({ where: { id: bookId }, select: { storageKey: true } })).storageKey;
  const hearing = await json<{ id: string }>(await page.request.post(`/api/causas/${causaId}/hearings`, { data: { title: "Audiencia preparatoria ficticia" } }), 201);
  workspaceId = hearing.id;
  await json(await page.request.post(`/api/causas/${causaId}/hearings/${workspaceId}/notes`, { data: { title: "Pedir exhibición del comprobante", body: noteText, citation: null } }));
  await json(await page.request.post(`/api/causas/${causaId}/hearings`, { data: { title: "Otra mesa ficticia más reciente" } }), 201);
  prepared = true;
}

test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  ownerId = (await db.user.create({ data: { email, name: "Profesional ficticio de escritos", role: "abogado", password: seed.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Causa ficticia de preparación de escritos", rit: "C-2026-PRUEBA", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  const key = `${prefix}/comprobante.txt`;
  await putObject({ key, body: publicText, contentType: "text/plain" });
  documentId = (await db.documento.create({ data: { nombre: "Comprobante ficticio de pago.txt", causaId, autorId: ownerId, mimeType: "text/plain", storageKey: key, contenido: publicText, extractedMarkdown: publicText, extractionStatus: "completed" } })).id;
});
test.afterAll(async () => {
  try {
    if (causaId) {
      await db.caseWritingDraft.deleteMany({ where: { causaId } });
      await db.hearingWorkspace.deleteMany({ where: { causaId } });
      await db.caseFact.deleteMany({ where: { causaId } });
      await db.causa.deleteMany({ where: { id: causaId } });
    }
    if (documentId) await db.documento.deleteMany({ where: { id: documentId } });
    if (bookId) await db.libraryBook.deleteMany({ where: { id: bookId } });
    if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
    const storageRoot = path.resolve(process.env.STORAGE_PATH || "storage");
    await rm(path.join(storageRoot, prefix), { recursive: true, force: true });
    if (documentId) await rm(path.join(storageRoot, "evidence", encodeURIComponent(documentId)), { recursive: true, force: true });
    if (bookStorageKey) await rm(path.join(storageRoot, bookStorageKey), { force: true });
  } finally { await db.$disconnect(); }
});

test("escrito por causa: guardado, tres orígenes, historial y salida con respaldos", async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, email); await prepare(page);
  await page.goto(`/causas/${causaId}/escritos`);
  await page.getByLabel("Nombre del nuevo escrito", { exact: true }).fill("Presentación de antecedentes");
  const creating = page.waitForResponse(response => new URL(response.url()).pathname === base() && response.request().method() === "POST");
  await page.getByRole("button", { name: "Nuevo escrito", exact: true }).click();
  const draft = (await json<WritingMutationResult>(await creating, 201)).draft;
  const editor = page.getByTestId("writing-editor"), body = editor.getByLabel("Texto del escrito", { exact: true });
  await expect(body).toHaveValue(draft.body);
  const ownText = "Solicito tener presentes los antecedentes del pago.\n\nSe solicita contrastar los originales en audiencia.";
  await body.fill(ownText);
  await expect.poll(async () => (await current(page, draft.id)).body).toBe(ownText);
  await expect(editor.locator(".writing-status")).toHaveAttribute("data-state", "saved");
  const savedRevision = (await current(page, draft.id)).revision;
  await page.reload(); await expect(body).toHaveValue(ownText);

  for (const [tab, text] of [["Hechos", publicText], ["Notas de audiencia", noteText], ["Biblioteca", bookText]]) {
    await editor.getByRole("tab", { name: tab, exact: true }).click();
    const candidate = editor.getByTestId("writing-source-candidate").filter({ hasText: text });
    await expect(candidate).toHaveCount(1);
    await candidate.getByRole("button", { name: "Incorporar al escrito", exact: true }).click();
    await expect(body).toHaveValue(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  await editor.getByRole("tab", { name: "Referencias (3)", exact: true }).click();
  await expect(editor.getByTestId("writing-reference")).toHaveCount(3);
  const noteOrigin = (await current(page, draft.id)).references.find(reference => reference.source.kind === "note")!.source.href;
  const origin = await page.context().newPage();
  try {
    await origin.goto(noteOrigin);
    await expect(origin.getByRole("combobox", { name: "Mesa privada", exact: true })).toHaveValue(workspaceId);
    await expect(origin.getByRole("heading", { name: "Pedir exhibición del comprobante", exact: true })).toBeVisible();
  } finally { await origin.close(); }
  await expect(editor).toContainText("Observación personal de audiencia sin respaldo documental asociado");
  await page.reload(); await editor.getByRole("tab", { name: "Referencias (3)", exact: true }).click();
  await expect(editor.getByTestId("writing-reference")).toHaveCount(3);
  const download = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descargar Markdown", exact: true }).click();
  const file = await download, exported = await readFile((await file.path())!, "utf8");
  const readableMarkdown = exported.replace(/\\([\\`*_{}\[\]()#+!|.\-])/g, "$1");
  for (const text of [publicText, noteText, bookText, "C-2026-PRUEBA", "SHA-256"]) expect(readableMarkdown).toContain(text);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("writing-references-desktop.png"), fullPage: true, animations: "disabled" });
  await editor.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(editor.getByTestId("writing-history-entry")).not.toHaveCount(0);
  await editor.getByTestId("writing-history-entry").getByRole("button", { name: new RegExp(`^Versión ${savedRevision}\\b`) }).click();
  for (const [mode, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`writing-${mode}.png`), fullPage: true, animations: "disabled" });
    if (mode === "mobile") {
      for (const [tab, filename] of [["Escribir", "writing-mobile-editor.png"], ["Fuentes", "writing-mobile-sources.png"]]) {
        await editor.getByRole("tab", { name: tab, exact: true }).click();
        if (tab === "Fuentes") await expect(editor.getByTestId("writing-source-candidate")).toHaveCount(1);
        await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
        await page.screenshot({ path: info.outputPath(filename), fullPage: true, animations: "disabled" });
      }
      await editor.getByRole("tab", { name: "Historial", exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor.getByTestId("writing-history-entry").getByRole("button", { name: new RegExp(`^Versión ${savedRevision}\\b`) }).click();
  await page.evaluate(() => { document.documentElement.classList.add("dark"); });
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("writing-dark.png"), fullPage: true, animations: "disabled" });
  const beforeRestore = await current(page, draft.id);
  await editor.getByTestId("writing-history-entry").getByRole("button", { name: new RegExp(`^Versión ${savedRevision}\\b`) }).click();
  await editor.getByRole("button", { name: "Recuperar como nueva versión", exact: true }).click();
  await expect.poll(async () => (await current(page, draft.id)).body).toBe(ownText);
  const restored = await current(page, draft.id);
  expect(restored.revision).toBe(beforeRestore.revision + 1);
  const history = await json<WritingHistory>(await page.request.get(`${base()}/${draft.id}/history`));
  expect(history.revisions.some(row => row.revision === beforeRestore.revision)).toBeTruthy();
  await page.reload(); await expect(body).toHaveValue(ownText);
});

test("guardado perdido y edición durante la solicitud: conserva texto y evita duplicados", async ({ page }) => {
  test.setTimeout(90_000); await loginAs(page, email);
  const draft = await createDraft(page, "Continuidad ante desconexión", "Texto inicial.");
  await page.goto(`/causas/${causaId}/escritos?draft=${draft.id}`);
  const editor = page.getByTestId("writing-editor"), body = editor.getByLabel("Texto del escrito", { exact: true });
  await expect(body).toHaveValue(draft.body);
  let unblock!: () => void;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  let firstCommitted!: () => void;
  const committed = new Promise<void>(resolve => { firstCommitted = resolve; });
  let intercepted = false;
  await page.route(url => url.pathname === `${base()}/${draft.id}`, async route => {
    if (route.request().method() !== "PATCH" || intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch(); expect(response.status()).toBe(200);
    firstCommitted(); await pending; await route.abort("failed");
  });
  const first = "Primer texto guardado cuyo resultado no llegó al navegador.";
  await body.fill(first); await committed;
  const latest = `${first}\nUn segundo párrafo escrito mientras se guardaba.`;
  await body.fill(latest); unblock();
  await editor.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect.poll(async () => (await current(page, draft.id)).body).toBe(latest);
  await expect(editor.locator(".writing-status")).toHaveAttribute("data-state", "saved");
  const history = await json<WritingHistory>(await page.request.get(`${base()}/${draft.id}/history`));
  expect(history.revisions).toHaveLength(3);
  await page.reload(); await expect(body).toHaveValue(latest);
});

test("volver en el navegador antes de la pausa de guardado conserva la última edición", async ({ page }) => {
  test.setTimeout(90_000); await loginAs(page, email);
  const draft = await createDraft(page, "Continuidad al volver", "Texto inicial de navegación.");
  await page.goto(`/causas/${causaId}`);
  await page.getByRole("link", { name: "Escribir con fuentes", exact: true }).click();
  await expect(page.getByLabel("Título del escrito", { exact: true })).toHaveValue(draft.title);
  const latest = "Última edición antes de volver a la carpeta de la causa.";
  await page.getByLabel("Texto del escrito", { exact: true }).fill(latest);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/causas/${causaId}$`));
  await expect.poll(async () => (await current(page, draft.id)).body).toBe(latest);
  await page.getByRole("link", { name: "Escribir con fuentes", exact: true }).click();
  await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue(latest);
});

test("conflicto de pestañas y revocación: no sobrescribe ni exporta derivados sin acceso", async ({ page }) => {
  test.setTimeout(90_000); await loginAs(page, email); await prepare(page);
  const draft = await createDraft(page, "Revisión de concurrencia", "Texto compartido entre dos sesiones propias.");
  await page.goto(`/causas/${causaId}/escritos?draft=${draft.id}`);
  const editor = page.getByTestId("writing-editor"), body = editor.getByLabel("Texto del escrito", { exact: true });
  await expect(body).toHaveValue(draft.body);
  const external = await json<WritingMutationResult>(await page.request.patch(`${base()}/${draft.id}`, { data: { requestId: randomUUID(), expectedRevision: draft.revision, title: draft.title, body: "Cambio confirmado desde la otra sesión." } }));
  await body.fill("Texto local que debe poder recuperarse y no sobrescribir al otro.");
  await expect(editor.getByRole("alert")).toContainText(/otra sesión|conflicto/i);
  await expect(body).toHaveValue("Texto local que debe poder recuperarse y no sobrescribir al otro.");
  expect((await current(page, draft.id)).body).toBe(external.draft.body);
  const fact = await db.caseFact.findUniqueOrThrow({ where: { id: factId }, select: { revision: true } });
  const attached = await json<WritingMutationResult>(await page.request.post(`${base()}/${draft.id}/sources`, { data: { requestId: randomUUID(), expectedRevision: external.draft.revision, source: { kind: "fact", factId, revision: fact.revision } } }));
  await db.documento.update({ where: { id: documentId }, data: { confidencial: true } });
  await db.user.update({ where: { id: ownerId }, data: { capabilityRevokes: "doc.confidential.read" } });
  try {
    for (const suffix of ["", "/export?format=markdown", `/history/${attached.draft.revision}`]) {
      const response = await page.request.get(`${base()}/${draft.id}${suffix}`);
      expect([404, 409]).toContain(response.status()); expect(await response.text()).not.toContain(publicText);
    }
    const restored = await page.request.post(`${base()}/${draft.id}/restore`, { data: { requestId: randomUUID(), expectedRevision: attached.draft.revision, targetRevision: attached.draft.revision } });
    expect([404, 409]).toContain(restored.status());
    await page.reload(); await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveCount(0);
    await expect(page.getByText(publicText, { exact: true })).toHaveCount(0);
    await page.getByTestId("writing-history-entry").getByRole("button", { name: new RegExp(`^Versión ${external.draft.revision}\\b`) }).click();
    await expect(page.getByRole("heading", { name: `Vista previa · versión ${external.draft.revision}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Recuperar como nueva versión", exact: true }).click();
    await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue(external.draft.body);
    const recovered = await current(page, draft.id);
    expect(recovered.revision).toBe(attached.draft.revision + 1);
    expect(recovered.references).toHaveLength(0);
  } finally {
    await db.user.update({ where: { id: ownerId }, data: { capabilityRevokes: "" } });
    await db.documento.update({ where: { id: documentId }, data: { confidencial: false } });
  }
});
