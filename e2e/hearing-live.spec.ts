import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { HearingLiveMutation, HearingLiveView } from "../src/lib/hearings/live-types";
import type { HearingNoteView } from "../src/lib/hearings/types";
import type { WritingMutationResult } from "../src/lib/writings/types";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Live hearing browser fixtures require local storage");
const tag = randomUUID(), ownerEmail = `live-owner-${tag}@example.test`, colleagueEmail = `live-colleague-${tag}@example.test`;
let ownerId = "", colleagueId = "", causaId = "", collectionId = "", bookId = "", bookKey = "";
const quote = "La buena fe debe observarse durante la ejecución del contrato. El comprobante de pago debe cotejarse con su original.";
let prepared = false;
const hearings = () => `/api/causas/${causaId}/hearings`;
const livePath = (id: string) => `${hearings()}/${id}/live`;
type AvailableNote = Extract<HearingNoteView, { available: true }>;
async function json<T>(response: Pick<APIResponse, "status" | "text" | "json">, status = 200): Promise<T> { expect(response.status(), await response.text()).toBe(status); return response.json(); }
async function current(page: Page, id: string) { return json<HearingLiveView>(await page.request.get(livePath(id))); }
async function sharedBook(page: Page) {
  if (prepared) return;
  const context = await page.context().browser()!.newContext({ baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3100", locale: "es-CL" });
  const colleague = await context.newPage();
  try {
    await loginAs(colleague, colleagueEmail);
    bookId = (await json<{ book: { id: string } }>(await colleague.request.post("/api/books", { multipart: { requestId: randomUUID(), title: "Lectura ficticia para audiencia", author: "Autora ficticia", preserveOriginal: "true", convertToText: "false", file: { name: "lectura-ficticia.txt", mimeType: "text/plain", buffer: Buffer.from(quote) } } }), 201)).book.id;
    bookKey = (await db.libraryBook.findUniqueOrThrow({ where: { id: bookId }, select: { storageKey: true } })).storageKey;
    const created = (await json<{ collection: { id: string; revision: number } }>(await colleague.request.post("/api/books/collections", { data: { name: "Colección ficticia para audiencia" } }), 201)).collection;
    collectionId = created.id;
    await json(await colleague.request.patch(`/api/books/collections/${collectionId}`, { data: { revision: created.revision, bookIds: [bookId], memberIds: [ownerId] } }));
    prepared = true;
  } finally { await context.close(); }
}
async function desk(page: Page, title: string) {
  const id = (await json<{ id: string }>(await page.request.post(hearings(), { data: { title } }), 201)).id;
  const source = await json<{ id: string }>(await page.request.post(`${hearings()}/${id}/sources`, { data: { kind: "book", refId: bookId } }));
  const reading = await json<{ fragments: { id: string; text: string }[] }>(await page.request.get(`${hearings()}/${id}/sources/${source.id}/read`));
  const citation = { sourceId: source.id, fragmentId: reading.fragments[0].id, quote: reading.fragments[0].text };
  const noted = await json<AvailableNote>(await page.request.post(`${hearings()}/${id}/notes`, { data: { title: "Ordenar antecedentes del pago", body: "Contrastar el pago alegado con la documentación conservada.", citation } }));
  const plain = await json<AvailableNote>(await page.request.post(`${hearings()}/${id}/notes`, { data: { title: "Pedir comprobante original", body: "Solicitar la exhibición del comprobante durante la audiencia.", citation: null } }));
  return { id, citation, noted, plain };
}
async function capture(page: Page, file: string) {
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement)?.blur();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  await page.screenshot({ path: file, animations: "disabled" });
}
test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  ownerId = (await db.user.create({ data: { email: ownerEmail, name: "Profesional ficticio en audiencia", role: "abogado", password: seed.password } })).id;
  colleagueId = (await db.user.create({ data: { email: colleagueEmail, name: "Colega ficticio", role: "abogado", password: seed.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Causa ficticia de audiencia en vivo", rit: "C-2026-PRUEBA", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  await db.causaMiembro.create({ data: { causaId, userId: colleagueId, rol: "colaborador" } });
});
test.afterAll(async () => {
  try {
    if (causaId) { await db.caseWritingDraft.deleteMany({ where: { causaId } }); await db.hearingWorkspace.deleteMany({ where: { causaId } }); await db.causa.deleteMany({ where: { id: causaId } }); }
    if (collectionId) await db.bookShelfCollection.deleteMany({ where: { id: collectionId } });
    if (bookId) await db.libraryBook.deleteMany({ where: { id: bookId } });
    for (const id of [ownerId, colleagueId].filter(Boolean)) { await db.auditEvent.deleteMany({ where: { actorId: id } }); await db.user.deleteMany({ where: { id } }); }
    if (bookKey) await rm(path.join(process.env.STORAGE_PATH || "storage", bookKey), { force: true });
  } finally { await db.$disconnect(); }
});

test("audiencia en vivo: guion guardado, tiempo con pausas, puntos tratados y registros con fuentes", async ({ page }, info) => {
  test.setTimeout(150_000); await loginAs(page, ownerEmail); await sharedBook(page);
  const workspace = await desk(page, "Audiencia preparatoria ficticia");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/audiencias/${workspace.id}`);
  await expect(page.getByRole("heading", { name: "Audiencia en vivo", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Herramientas de audiencia", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Todas mis audiencias", exact: true })).toHaveAttribute("href", "/audiencias");
  await expect(page.getByRole("navigation", { name: "Recorrido de la causa", exact: true }).getByRole("link", { name: "Audiencias", exact: true })).toHaveAttribute("href", `/audiencias/${workspace.id}`);
  await expect(page.locator(".hearing-session-clock time")).toContainText(/\d{2}:\d{2}/);
  expect(new URL(page.url()).pathname).toBe(`/audiencias/${workspace.id}`);
  expect(new URL(page.url()).searchParams.has("mesa")).toBe(false);
  const panel = page.getByTestId("hearing-live");
  await expect(panel).toBeVisible();
  expect((await current(page, workspace.id)).phase).toBe("idle");
  await panel.getByText("Preparar el guion guardado", { exact: true }).click();
  await panel.getByRole("textbox", { name: "Apertura guardada", exact: true }).fill("Solicito tener presentes los antecedentes del pago.");
  await panel.getByRole("textbox", { name: "Petición de cierre guardada", exact: true }).fill("Solicito resolver sobre la exhibición de los originales.");
  await panel.getByRole("checkbox", { name: /Ordenar antecedentes del pago/ }).check();
  await panel.getByRole("checkbox", { name: /Pedir comprobante original/ }).check();
  await panel.getByRole("button", { name: "Iniciar audiencia", exact: true }).click();
  await expect.poll(async () => (await current(page, workspace.id)).phase).toBe("running");
  await expect.poll(async () => (await current(page, workspace.id)).elapsedSeconds).toBeGreaterThan(0);
  const runningClock = panel.getByTestId("hearing-live-clock");
  const priorTick = await runningClock.innerText();
  await page.getByRole("button", { name: "Notas", exact: true }).click();
  await expect(page.locator("#hearing-context")).toBeVisible();
  await expect.poll(() => runningClock.innerText()).not.toBe(priorTick);
  await page.locator("#hearing-context").getByRole("button", { name: "Cerrar", exact: true }).click();
  await panel.getByRole("button", { name: "Pausar tiempo", exact: true }).click();
  await expect.poll(async () => (await current(page, workspace.id)).phase).toBe("paused");
  const paused = await current(page, workspace.id);
  expect(paused.phase).toBe("paused"); expect(paused.plan.noteIds).toHaveLength(2);
  expect(paused.plan.opening).toContain("antecedentes del pago");
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/audiencias/${workspace.id}$`));
  await panel.getByText("Preparar el guion guardado", { exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Apertura guardada", exact: true })).toHaveValue(paused.plan.opening);
  expect((await current(page, workspace.id)).elapsedSeconds).toBe(paused.elapsedSeconds);
  await panel.getByTestId("live-cue").filter({ hasText: "Ordenar antecedentes del pago" }).getByRole("checkbox", { name: "Tratado", exact: true }).check();
  await expect.poll(async () => (await current(page, workspace.id)).plan.addressedNoteIds).toContain(workspace.noted.id);
  await page.getByRole("button", { name: "Lectura", exact: true }).click();
  await page.locator(".hearing-fragment").getByRole("button", { name: "Registrar en vivo", exact: true }).click();
  await panel.getByRole("combobox", { name: "Tipo de registro", exact: true }).selectOption("decision");
  await panel.getByRole("textbox", { name: "Encabezado del registro", exact: true }).fill("Exhibición de comprobante");
  await panel.getByRole("textbox", { name: "Registro de audiencia", exact: true }).fill("Se anota que se pidió exhibir el comprobante original. Registro personal ficticio.");
  await panel.getByRole("button", { name: "Guardar registro de audiencia", exact: true }).click();
  await expect(panel.getByTestId("live-entry")).toHaveCount(1);
  const entries = (await current(page, workspace.id)).entries;
  expect(entries[0].available && entries[0].citation?.quote).toBe(quote);
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Descargar registro de sesión", exact: true }).click();
  const exported = await readFile((await (await downloading).path())!, "utf8");
  expect(exported).toContain(quote); expect(exported).toContain("Exhibición de comprobante"); expect(exported).toContain("C-2026-PRUEBA");
  await panel.getByText("Preparar el guion guardado", { exact: true }).click();
  await page.getByRole("button", { name: "Lectura", exact: true }).click();
  await page.locator(".hearing-fragment").getByRole("button", { name: "Registrar en vivo", exact: true }).click();
  for (const [mode, viewport] of [["desktop", { width: 1440, height: 1100 }], ["mobile", { width: 360, height: 900 }]] as const) {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: "reduce" });
    const margin = mode === "mobile" ? 256 : 160;
    await panel.evaluate((element, offset) => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - offset), behavior: "instant" }), margin);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const tools = page.getByRole("navigation", { name: "Herramientas de audiencia", exact: true }).getByRole("button");
    await expect(tools).toHaveCount(4);
    await expect(page.getByText("Preparar y analizar", { exact: true })).toBeVisible();
    for (const tool of await tools.all()) {
      const bounds = await tool.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await capture(page, info.outputPath(`live-${mode}.png`));
    await panel.getByRole("button", { name: "Registrar lo ocurrido", exact: true }).click();
    await expect(panel.getByRole("textbox", { name: "Encabezado del registro", exact: true })).toBeFocused();
    await capture(page, info.outputPath(`live-quick-${mode}.png`));
    await panel.locator(".hearing-live-log").evaluate((element, offset) => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - offset), behavior: "instant" }), margin);
    await capture(page, info.outputPath(`live-log-${mode}.png`));
  }
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.evaluate(() => document.documentElement.classList.add("dark"));
  await panel.evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 112), behavior: "instant" })); await capture(page, info.outputPath("live-dark.png"));
  await panel.getByRole("button", { name: "Retirar pasaje del registro", exact: true }).click();
  await panel.getByRole("button", { name: "Reanudar tiempo", exact: true }).click();
  await panel.getByRole("button", { name: "Finalizar sesión", exact: true }).click();
  await expect.poll(async () => (await current(page, workspace.id)).phase).toBe("finished");
});

test("registro perdido, escrito de causa y fuente retirada: conserva privacidad y evita duplicados", async ({ page }) => {
  test.setTimeout(150_000); await loginAs(page, ownerEmail); await sharedBook(page);
  const workspace = await desk(page, "Control ficticio de continuidad");
  const state = await current(page, workspace.id);
  await json<HearingLiveMutation>(await page.request.post(`${livePath(workspace.id)}/control`, { data: { requestId: randomUUID(), expectedRevision: state.revision, action: "start" } }));
  await page.goto(`/causas/${causaId}/audiencias?mesa=${workspace.id}`);
  await page.getByRole("button", { name: "En vivo", exact: true }).click();
  const panel = page.getByTestId("hearing-live"), body = "Objeción anotada por el profesional; material ficticio para comprobar la continuidad.";
  await page.getByRole("button", { name: "Lectura", exact: true }).click();
  await page.locator(".hearing-fragment").getByRole("button", { name: "Registrar en vivo", exact: true }).click();
  await panel.getByRole("textbox", { name: "Encabezado del registro", exact: true }).fill("Revisión de antecedentes");
  await panel.getByRole("textbox", { name: "Registro de audiencia", exact: true }).fill(body);
  let intercepted = false;
  await page.route(url => url.pathname === `${livePath(workspace.id)}/entries`, async route => {
    if (intercepted || route.request().method() !== "POST") return route.continue();
    intercepted = true; const saved = await route.fetch(); expect(saved.status()).toBe(201); await route.abort("failed");
  });
  await panel.getByRole("button", { name: "Guardar registro de audiencia", exact: true }).click();
  await panel.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(panel.getByTestId("live-entry")).toHaveCount(1);
  const recorded = (await current(page, workspace.id)).entries[0]; expect(recorded.available).toBeTruthy();
  const writings = `/api/causas/${causaId}/writings`;
  const draft = (await json<WritingMutationResult>(await page.request.post(writings, { data: { requestId: randomUUID(), title: "Escrito desde audiencia en vivo", body: "Texto propio para revisar." } }), 201)).draft;
  const withEntry = await json<WritingMutationResult>(await page.request.post(`${writings}/${draft.id}/sources`, { data: { requestId: randomUUID(), expectedRevision: draft.revision, source: { kind: "note", workspaceId: workspace.id, noteId: recorded.id, revision: recorded.available ? recorded.revision : 1 } } }));
  expect(withEntry.draft.body).toContain(body); expect(withEntry.draft.references[0].source.citations[0].quote).toBe(quote);
  expect(withEntry.draft.references[0].source.warnings.join(" ")).toContain("Registro personal en vivo");
  const context = await page.context().browser()!.newContext({ baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3100", locale: "es-CL" });
  const colleague = await context.newPage();
  try {
    await loginAs(colleague, colleagueEmail);
    expect((await colleague.request.get(livePath(workspace.id))).status()).toBe(404);
    await colleague.goto(`/audiencias/${workspace.id}`);
    await expect(colleague.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
    await expect(colleague.getByRole("heading", { name: "Audiencia en vivo", exact: true })).toHaveCount(0);
    await expect(colleague.locator("body")).not.toContainText("Control ficticio de continuidad");
    const collection = (await json<{ collection: { revision: number } }>(await colleague.request.get(`/api/books/collections/${collectionId}`))).collection;
    await json(await colleague.request.patch(`/api/books/collections/${collectionId}`, { data: { revision: collection.revision, memberIds: [] } }));
    const revoked = await current(page, workspace.id);
    expect(revoked.entries.find(entry => entry.id === recorded.id)).toEqual({ id: recorded.id, available: false });
    expect(JSON.stringify(revoked)).not.toContain(body); expect(JSON.stringify(revoked)).not.toContain(quote);
    expect((await page.request.get(`${writings}/${draft.id}`)).status()).toBe(409);
    const exported = await page.request.get(`${livePath(workspace.id)}/export`);
    expect(exported.status()).toBe(200); expect(await exported.text()).not.toContain(body); expect(await exported.text()).not.toContain(quote);
    await panel.getByRole("button", { name: "Actualizar sesión", exact: true }).click();
    await expect(panel.getByText(body, { exact: true })).toHaveCount(0);
    await expect(page.locator(".hearing-reading").getByText(quote, { exact: true })).toHaveCount(0);
    await expect(page.locator(".hearing-reading").getByRole("heading", { name: "Lectura ficticia para audiencia", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test("anotación pendiente al volver y contador sin conexión: recuperación sin registrar automáticamente", async ({ page }) => {
  test.setTimeout(120_000); await loginAs(page, ownerEmail);
  const other = await json<{ id: string }>(await page.request.post(hearings(), { data: { title: "Otra mesa ficticia de navegación" } }), 201);
  const first = await json<{ id: string }>(await page.request.post(hearings(), { data: { title: "Borrador ficticio aún sin confirmar" } }), 201);
  await page.goto(`/causas/${causaId}`);
  await page.getByRole("link", { name: "Abrir mesa de audiencia", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Mesa privada", exact: true })).toHaveValue(first.id);
  await page.getByRole("button", { name: "En vivo", exact: true }).click();
  const panel = page.getByTestId("hearing-live");
  const pending = "Anotación personal ficticia pendiente de confirmar.";
  await panel.getByRole("textbox", { name: "Encabezado del registro", exact: true }).fill("Borrador pendiente");
  await panel.getByRole("textbox", { name: "Registro de audiencia", exact: true }).fill(pending);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/causas/${causaId}$`));
  await page.getByRole("link", { name: "Abrir mesa de audiencia", exact: true }).click();
  await page.getByRole("button", { name: "En vivo", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Registro de audiencia", exact: true })).toHaveValue(pending);
  expect((await current(page, first.id)).entries).toHaveLength(0);
  await page.getByRole("combobox", { name: "Mesa privada", exact: true }).selectOption(other.id);
  await expect(page.getByRole("combobox", { name: "Mesa privada", exact: true })).toHaveValue(first.id);
  await panel.getByRole("button", { name: "Descartar registro sin guardar", exact: true }).click();
  await page.getByRole("combobox", { name: "Mesa privada", exact: true }).selectOption(other.id);
  await expect(page.getByRole("combobox", { name: "Mesa privada", exact: true })).toHaveValue(other.id);
  await expect(panel.getByRole("textbox", { name: "Registro de audiencia", exact: true })).toHaveValue("");
  await panel.getByRole("button", { name: "Iniciar audiencia", exact: true }).click();
  await expect.poll(async () => (await current(page, other.id)).elapsedSeconds).toBeGreaterThan(0);
  const liveMatcher = (url: URL) => url.pathname === livePath(other.id);
  await page.route(liveMatcher, async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Conexión interrumpida de forma simulada" }) });
  });
  await panel.getByRole("button", { name: "Actualizar sesión", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Sin actualización del servidor" })).toContainText("Conexión interrumpida");
  const clock = panel.getByTestId("hearing-live-clock"), frozen = await clock.textContent();
  // Observe more than one display tick: a failed refresh must freeze the shown clock.
  await page.waitForTimeout(1300);
  await expect(clock).toHaveText(frozen!);
  await panel.getByRole("button", { name: "Actualizar sesión", exact: true }).click();
  await page.waitForTimeout(1300);
  await expect(clock).toHaveText(frozen!);
  await page.unroute(liveMatcher);
  await panel.getByRole("button", { name: "Actualizar sesión", exact: true }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Sin actualización del servidor" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Finalizar sesión", exact: true }).click();
  await expect.poll(async () => (await current(page, other.id)).phase).toBe("finished");
});
