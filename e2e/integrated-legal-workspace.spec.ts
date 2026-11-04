import { test, expect, type APIResponse, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { BookCollectionView, BookSummary } from "../src/lib/books/types";
import type { CaseAudioView } from "../src/lib/audio/types";
import type { HearingReading, HearingSourceView, HearingTurnView, HearingWorkspaceSummary, HearingWorkspaceView } from "../src/lib/hearings/types";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const bookIds: string[] = [], collectionIds: string[] = [], workspaceIds: string[] = [], audioIds: string[] = [];
const storageKeys = new Set<string>();
let causaId = "";
type JsonResponse = Pick<APIResponse, "status" | "text" | "json">;
type AvailableSource = Extract<HearingSourceView, { available: true }>;
type AvailableTurn = Extract<HearingTurnView, { available: true }>;

async function json<T>(response: JsonResponse, status = 200): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

function syntheticWav() {
  // Silence only. The imported TXT is explicitly fictitious; this does not test speech recognition.
  const bytes = Buffer.alloc(16_044);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16_000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(16_000, 40);
  return bytes;
}

async function settleCapture(page: Page) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
}

async function closeHearingPanel(workbench: Locator) {
  const panel = workbench.locator("#hearing-context");
  if (await panel.isVisible()) await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
}

async function openHearingPanel(workbench: Locator, name: "Fuentes" | "Lectura" | "Notas" | "Conversación") {
  // The mounted panel becomes a modal drawer on mobile. Close it before using
  // its outside toolbar; changing tools must retain editors and selected quotes.
  await closeHearingPanel(workbench);
  const toolbar = workbench.getByRole("navigation", { name: "Herramientas de audiencia", exact: true });
  if (name === "Conversación") await toolbar.getByText("Preparar y analizar", { exact: true }).click();
  await toolbar.getByRole("button", { name, exact: true }).click();
  await expect(workbench.locator("#hearing-context")).toBeVisible();
}

test.afterAll(async () => {
  try {
    const [sources, notes, turns, versions, documents] = await Promise.all([
      db.hearingSource.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } }),
      db.hearingNote.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } }),
      db.hearingChatTurn.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } }),
      db.documentEvidenceVersion.findMany({ where: { resource: { documento: { causaId: causaId || "__none__" } } }, select: { id: true, sourceStorageKey: true } }),
      db.documento.findMany({ where: { causaId: causaId || "__none__" }, select: { id: true } }),
    ]);
    for (const version of versions) if (version.sourceStorageKey) storageKeys.add(version.sourceStorageKey);
    const entityIds = [...bookIds, ...collectionIds, ...workspaceIds, ...audioIds, ...sources.map(row => row.id), ...notes.map(row => row.id), ...turns.map(row => row.id), ...documents.map(row => row.id)];
    await db.hearingNote.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.hearingChatTurn.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.hearingSource.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.hearingWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.caseAudio.deleteMany({ where: { id: { in: audioIds } } });
    if (causaId) {
      await db.documento.deleteMany({ where: { causaId } });
      await db.causa.deleteMany({ where: { id: causaId } });
    }
    await db.bookShelfCollection.deleteMany({ where: { id: { in: collectionIds } } });
    await db.libraryBook.deleteMany({ where: { id: { in: bookIds } } });
    await db.auditEvent.deleteMany({ where: { entityId: { in: entityIds } } });
    await Promise.all([...storageKeys].map(key => rm(path.join(process.env.STORAGE_PATH || "storage", key), { force: true })));
  } finally { await db.$disconnect(); }
});

test("flujo conjunto: sentencia compartida, audio y transcripción citada en la misma audiencia, con revocación", async ({ page, browser, context }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let unexpectedBrowserRequests = 0;
  const hostOrigin = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3100").origin;
  const restrictBrowserToHost = async (target: typeof context) => {
    await target.route("**/*", route => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== hostOrigin) {
        unexpectedBrowserRequests++; return route.abort();
      }
      return route.continue();
    });
  };
  await restrictBrowserToHost(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { (window as typeof window & { __jointCopiedText: string }).__jointCopiedText = text; },
    } });
  });
  await loginAs(page, "abogado@estudio.cl");
  const professional = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  const tag = randomUUID().slice(0, 8), judgmentTitle = `Sentencia ficticia para audiencia conjunta ${tag}`;
  const caseNumber = `FICTICIO-${tag}`, court = "Tribunal ficticio de verificación conjunta";
  const judicialNoteTitle = `Contrastar el documento judicial ${tag}`, judicialObservation = `OBSERVACIÓN FICTICIA PRIVADA DE LA SENTENCIA ${tag}`;
  const transcriptNoteTitle = `Revisar la transcripción conservada ${tag}`;
  const transcript = `Declaración enteramente ficticia ${tag}: el importe del pago debe contrastarse con el documento de la causa. Texto de prueba aportado manualmente; no representa el silencio del audio sintético.`;
  const otherContext = await browser.newContext({ locale: "es-CL" }), other = await otherContext.newPage();
  await restrictBrowserToHost(otherContext);
  try {
    await loginAs(other, "asistente@estudio.cl");
    const judgmentPdfBytes = await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf");
    const imported = await json<{ book: BookSummary }>(await other.request.post("/api/books", { multipart: {
      requestId: randomUUID(), title: judgmentTitle, sourceType: "judgment", preserveOriginal: "true", convertToText: "false",
      judicialJson: JSON.stringify({ court, caseNumber, decisionDate: "2026-11-01", caseTitle: "Partes enteramente ficticias", matter: "Prueba ficticia de pago" }),
      file: { name: "sentencia-enteramente-ficticia.pdf", mimeType: "application/pdf", buffer: judgmentPdfBytes },
    } }), 201);
    const book = imported.book; bookIds.push(book.id);
    expect(book.sourceSha256).toBe(createHash("sha256").update(judgmentPdfBytes).digest("hex"));
    storageKeys.add((await db.libraryBook.findUniqueOrThrow({ where: { id: book.id } })).storageKey);
    expect((await page.request.get(`/api/books/${book.id}`)).status()).toBe(404);
    const createdCollection = await json<{ collection: BookCollectionView }>(await other.request.post("/api/books/collections", { data: { name: `Resoluciones compartidas ficticias ${tag}` } }), 201);
    const collection = createdCollection.collection; collectionIds.push(collection.id);
    const granted = await json<{ collection: BookCollectionView }>(await other.request.patch(`/api/books/collections/${collection.id}`, { data: { revision: collection.revision, bookIds: [book.id], memberIds: [professional.id] } }));

    await page.goto("/biblioteca?fuentes=judicial");
    await page.getByRole("textbox", { name: "Buscar en mis libros", exact: true }).fill(caseNumber);
    const sharedJudgment = page.locator(`[data-book-id="${book.id}"]`);
    await expect(sharedJudgment).toBeVisible(); await expect(sharedJudgment).toContainText(court);
    await sharedJudgment.getByRole("link", { name: `Abrir ${judgmentTitle}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: judgmentTitle, exact: true })).toBeVisible();
    await page.locator(".book-reading-actions").getByRole("button", { name: "Ficha y descargas", exact: true }).click();
    const readerTools = page.getByRole("dialog", { name: "Herramientas de lectura", exact: true });
    await expect(readerTools.locator(".book-reader-information")).toContainText(`Rol ${caseNumber}`);
    await readerTools.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByLabel("Página física del PDF", { exact: true }).selectOption("2");
    await expect(page.getByRole("img", { name: `Página física 2 de ${judgmentTitle}`, exact: true })).toBeVisible();

    const causa = await db.causa.create({ data: { titulo: `Expediente ficticio conjunto ${tag}`, tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: professional.id } });
    causaId = causa.id;
    const base = `/api/causas/${causaId}`, hearingBase = `${base}/hearings`;
    await page.goto(`/causas/${causaId}/audiencias`);
    const workbench = page.getByRole("region", { name: "Acompañante de audiencia" }), audioPanel = page.getByTestId("case-audio-manager");
    await workbench.getByLabel("Crear otra mesa").fill(`Audiencia conjunta ficticia ${tag}`);
    const creating = page.waitForResponse(response => new URL(response.url()).pathname === hearingBase && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Crear mesa", exact: true }).click();
    const workspace = await json<HearingWorkspaceSummary>(await creating, 201); workspaceIds.push(workspace.id);
    const desk = `${hearingBase}/${workspace.id}`;
    await openHearingPanel(workbench, "Fuentes");
    await workbench.getByLabel("Añadir material accesible").selectOption(`book:${book.id}`);
    const attachingJudgment = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/sources` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Añadir al dossier", exact: true }).click();
    const judgmentSource = await json<AvailableSource>(await attachingJudgment);
    let pageAttempts = 0;
    await page.route(url => url.pathname === `${desk}/sources/${judgmentSource.id}/page` && url.searchParams.get("page") === "2", async route => {
      if (++pageAttempts === 1) await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "El renderizador PDF está ocupado; vuelva a intentar" }) });
      else await route.continue();
    });
    await workbench.getByLabel("Página física del PDF", { exact: true }).selectOption("2");
    await expect(workbench.locator(".hearing-fragment")).toHaveCount(1);
    // OCR is an aid to reading, not a guarantee that an amount was recognized correctly.
    await expect(workbench.locator(".hearing-fragment")).toContainText("PAGINA DOS - DOCUMENTO ESCANEADO");
    await expect(workbench.locator(".hearing-fragment")).toContainText("12 DE MAYO DE 2025");
    const judgmentImage = workbench.getByRole("img", { name: `Página 2 de ${judgmentTitle}`, exact: true });
    await expect(judgmentImage).toBeVisible();
    expect(pageAttempts).toBeGreaterThanOrEqual(2);
    await expect.poll(() => judgmentImage.evaluate(node => { const image = node as HTMLImageElement; return image.complete && image.naturalWidth > 0; })).toBe(true);
    const judgmentReading = await json<HearingReading>(await page.request.get(`${desk}/sources/${judgmentSource.id}/read?page=2`));
    expect(judgmentReading.page).toBe(2); expect(judgmentReading.fragments).toHaveLength(1);
    const judgmentQuote = judgmentReading.fragments[0].text.slice(0, 2200);
    await workbench.getByRole("button", { name: "Guardar punto", exact: true }).click();
    await expect(workbench.getByText("Organizador de lectura guardado.", { exact: true })).toBeVisible();
    await workbench.locator(".hearing-fragment").getByRole("button", { name: "Conversar", exact: true }).click();
    await expect(workbench.locator(".hearing-chat-selection>li")).toHaveCount(1);
    await openHearingPanel(workbench, "Lectura");
    await expect(judgmentImage).toBeVisible();
    await workbench.locator(".hearing-fragment").getByRole("button", { name: "Anotar", exact: true }).click();
    await workbench.getByLabel("Título de la nota", { exact: true }).fill(judicialNoteTitle);
    await workbench.getByLabel("Su observación").fill(judicialObservation);
    await workbench.getByLabel("Título de la nota", { exact: true }).evaluate(node => { (node as HTMLElement).dataset.retainedDraft = "joint-judicial-draft"; });
    await closeHearingPanel(workbench);

    // A publication in the sibling audio tool must appear without reloading or losing this draft.
    await audioPanel.getByLabel("Añadir una grabación", { exact: false }).setInputFiles({ name: "audiencia-ficticia.wav", mimeType: "audio/wav", buffer: syntheticWav() });
    await audioPanel.getByLabel("Título de la grabación", { exact: true }).fill(`Audio conjunto ficticio ${tag}`);
    const uploadingAudio = page.waitForResponse(response => new URL(response.url()).pathname === `${base}/audios` && response.request().method() === "POST");
    await audioPanel.getByRole("button", { name: "Guardar en la causa", exact: true }).click();
    const audio = (await json<{ audio: CaseAudioView }>(await uploadingAudio, 201)).audio; audioIds.push(audio.id);
    storageKeys.add((await db.caseAudio.findUniqueOrThrow({ where: { id: audio.id } })).storageKey);
    await expect(audioPanel.locator("audio")).toBeVisible();
    await audioPanel.getByLabel("Importar transcripción de texto", { exact: true }).setInputFiles({ name: "declaracion-ficticia.txt", mimeType: "text/plain", buffer: Buffer.from(transcript) });
    await expect(audioPanel.getByLabel("Transcripción de trabajo", { exact: true })).toHaveValue(transcript);
    await audioPanel.getByRole("checkbox", { name: "He cotejado esta versión escuchando la grabación y confirmo su revisión.", exact: true }).check();
    const savingTranscript = page.waitForResponse(response => new URL(response.url()).pathname === `${base}/audios/${audio.id}` && response.request().method() === "PATCH");
    await audioPanel.getByRole("button", { name: "Guardar texto y revisión", exact: true }).click();
    await json(await savingTranscript);
    await expect(audioPanel.getByText("Revisión humana registrada", { exact: true })).toBeVisible();
    const publishing = page.waitForResponse(response => new URL(response.url()).pathname === `${base}/audios/${audio.id}/publish` && response.request().method() === "POST");
    await audioPanel.getByRole("button", { name: "Guardar copia en Transcripciones", exact: true }).click();
    const publication = (await json<{ document: { id: string; nombre: string; ruta: string; causaId: string } }>(await publishing, 201)).document;
    expect(publication.causaId).toBe(causaId); expect(publication.ruta).toBe("Audiencias/Transcripciones");
    await openHearingPanel(workbench, "Fuentes");
    await expect(workbench.getByLabel("Añadir material accesible").locator(`option[value="document:${publication.id}"]`)).toHaveCount(1);
    await openHearingPanel(workbench, "Notas");
    await expect(workbench.getByLabel("Título de la nota", { exact: true })).toHaveValue(judicialNoteTitle);
    await expect(workbench.getByLabel("Título de la nota", { exact: true })).toHaveAttribute("data-retained-draft", "joint-judicial-draft");
    await expect(workbench.getByLabel("Su observación")).toHaveValue(judicialObservation);
    await openHearingPanel(workbench, "Conversación");
    await expect(workbench.locator(".hearing-chat-selection>li")).toHaveCount(1);
    await openHearingPanel(workbench, "Notas");
    const savingJudicialNote = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/notes` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Guardar nota", exact: true }).click();
    const judicialNote = await json<{ id: string }>(await savingJudicialNote);
    await expect(workbench.locator(".hearing-saved-note").getByRole("heading", { name: judicialNoteTitle, exact: true })).toBeVisible();

    await openHearingPanel(workbench, "Fuentes");
    await workbench.getByLabel("Añadir material accesible").selectOption(`document:${publication.id}`);
    const attachingTranscript = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/sources` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Añadir al dossier", exact: true }).click();
    const transcriptSource = await json<AvailableSource>(await attachingTranscript);
    await expect(workbench.getByText("Este documento todavía no tiene pasajes preparados para citar.", { exact: true })).toBeVisible();
    const preparing = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/sources/${transcriptSource.id}/prepare` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Preparar texto y páginas", exact: true }).click();
    const prepared = await json<{ versionId: string }>(await preparing);
    const transcriptFragment = workbench.locator(".hearing-fragment").filter({ hasText: transcript });
    await expect(transcriptFragment).toHaveCount(1);
    await expect(workbench.getByLabel("Página física del PDF", { exact: true })).toHaveCount(0);
    const reading = await json<HearingReading>(await page.request.get(`${desk}/sources/${transcriptSource.id}/read`));
    expect(reading.versionId).toBe(prepared.versionId); expect(reading.page).toBeNull(); expect(reading.locatorKind).toBe("text-offset");
    const preservedText = await page.request.get(`/api/evidence/versions/${prepared.versionId}/original`);
    expect(preservedText.status()).toBe(200); expect(await preservedText.text()).toContain(transcript);
    const publicationHash = createHash("sha256").update(await preservedText.body()).digest("hex");
    await transcriptFragment.getByRole("button", { name: "Anotar", exact: true }).click();
    await workbench.getByLabel("Título de la nota", { exact: true }).fill(transcriptNoteTitle);
    await workbench.getByLabel("Su observación").fill("Observación personal sobre el TXT ficticio. Debe contrastarse escuchando la grabación.");
    const savingTranscriptNote = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/notes` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Guardar nota", exact: true }).click();
    const transcriptNote = await json<{ id: string }>(await savingTranscriptNote);
    await expect(workbench.locator(".hearing-saved-note").getByRole("heading", { name: transcriptNoteTitle, exact: true })).toBeVisible();
    await openHearingPanel(workbench, "Lectura");
    await transcriptFragment.getByRole("button", { name: "Conversar", exact: true }).click();
    await expect(workbench.locator(".hearing-chat-selection>li")).toHaveCount(2);
    await workbench.getByLabel("Forma de trabajo").selectOption("extractive");
    const question = `Contrastar sentencia y transcripción ficticias ${tag}`;
    await workbench.getByLabel("Qué quiere revisar").fill(question);
    const conversing = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/chat` && response.request().method() === "POST");
    await workbench.getByRole("button", { name: "Guardar pasajes", exact: true }).click();
    const turn = (await json<{ turn: AvailableTurn }>(await conversing)).turn;
    expect(turn.mode).toBe("extractive"); expect(turn.modelUsed).toBe(false); expect(turn.citations).toHaveLength(2);
    const judgmentCitation = turn.citations.find(citation => citation.origin === "book");
    const transcriptCitation = turn.citations.find(citation => citation.origin === "knowledge");
    if (!judgmentCitation || judgmentCitation.origin !== "book") throw new Error("La conversación debe conservar su referencia a la sentencia");
    expect(judgmentCitation?.sourceId).toBe(judgmentSource.id); expect(judgmentCitation?.snapshot.pageNumber).toBe(2);
    expect(judgmentCitation.quote).toBe(judgmentQuote);
    expect(judgmentCitation.snapshot.quoteSha256).toBe(createHash("sha256").update(judgmentQuote).digest("hex"));
    expect(judgmentCitation.snapshot.sourceSha256).toBe(book.sourceSha256);
    expect(judgmentCitation.snapshot.extractionMethod).toBe("ocr");
    expect(judgmentCitation.warning).toMatch(/OCR/);
    expect(judgmentCitation.warning).toMatch(/contraste el original/i);
    expect(judgmentCitation?.reference).toContain(court); expect(judgmentCitation?.reference).toContain(`Rol ${caseNumber}`);
    expect(transcriptCitation?.sourceId).toBe(transcriptSource.id); expect(transcriptCitation?.snapshot.sourceSha256).toBe(publicationHash);
    expect(transcriptCitation?.snapshot.pageNumber).toBeNull(); expect(transcriptCitation?.warning).toContain("Cotejo contra la transcripción TXT");
    expect(transcriptCitation?.warning).toContain("revisión humana");
    await expect(workbench.locator(".hearing-turn")).toHaveCount(1);
    await expect(workbench.locator(".hearing-turn")).toContainText("sin llamada a IA");
    const verifying = page.waitForResponse(response => new URL(response.url()).pathname === `${desk}/verify` && response.request().method() === "POST");
    await workbench.locator(".hearing-turn").getByRole("button", { name: "Corroborar y copiar", exact: true }).click();
    const verified = await json<{ text: string }>(await verifying); expect(verified.text).toContain(court); expect(verified.text).toContain(transcript);
    expect(verified.text).toContain("no acredita fidelidad al audio");
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __jointCopiedText?: string }).__jointCopiedText || "")).toContain(`Rol ${caseNumber}`);
    await closeHearingPanel(workbench);
    const downloading = page.waitForEvent("download");
    await workbench.getByRole("button", { name: "Exportar mesa", exact: true }).click();
    const download = await downloading; expect(download.suggestedFilename()).toBe("mesa-audiencia.txt");
    const downloadPath = await download.path(); expect(downloadPath).not.toBeNull();
    const exportedText = await readFile(downloadPath!, "utf8"); expect(exportedText).toContain(court); expect(exportedText).toContain(transcript); expect(exportedText).toContain("no acredita fidelidad al audio");

    await page.reload();
    await expect(workbench.locator(".hearing-source-button")).toHaveCount(2);
    await expect(audioPanel.getByLabel("Transcripción de trabajo", { exact: true })).toHaveValue(transcript);
    await openHearingPanel(workbench, "Conversación");
    await expect(workbench.locator(".hearing-turn")).toContainText(question);
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport);
      await openHearingPanel(workbench, "Fuentes");
      await workbench.locator(".hearing-source-button").filter({ hasText: judgmentTitle }).click();
      await expect(judgmentImage).toBeVisible();
      await expect.poll(() => judgmentImage.evaluate(node => { const image = node as HTMLImageElement; return image.complete && image.naturalWidth > 0; })).toBe(true);
      await openHearingPanel(workbench, "Conversación");
      await expect(judgmentImage).toBeHidden();
      await expect(workbench.locator(".hearing-turn")).toBeVisible();
      await expect(workbench.locator(".hearing-turn .hearing-citation")).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await settleCapture(page);
      await page.screenshot({ path: testInfo.outputPath(`integrated-legal-workspace-${name}.png`), fullPage: true });
    }

    // Revoking one source must hide the mixed derivative, while the case's authorized TXT stays usable.
    await json(await other.request.patch(`/api/books/collections/${collection.id}`, { data: { revision: granted.collection.revision, memberIds: [] } }));
    expect((await page.request.get(`/api/books/${book.id}`)).status()).toBe(404);
    expect((await page.request.get(`${desk}/sources/${judgmentSource.id}/read`)).status()).toBe(404);
    const revoked = await json<HearingWorkspaceView>(await page.request.get(desk));
    expect(revoked.notes.find(note => note.id === judicialNote.id)).toEqual({ id: judicialNote.id, available: false });
    expect(revoked.notes.find(note => note.id === transcriptNote.id)?.available).toBe(true);
    expect(revoked.turns.find(item => item.id === turn.id)).toEqual({ id: turn.id, available: false });
    const currentTranscript = await json<HearingReading>(await page.request.get(`${desk}/sources/${transcriptSource.id}/read`));
    expect(currentTranscript.fragments.some(fragment => fragment.text.includes(transcript))).toBe(true);
    expect((await page.request.post(`${desk}/verify`, { data: { turnId: turn.id } })).status()).toBe(404);
    const revokedExport = await json<{ text: string }>(await page.request.get(`${desk}/export`));
    expect(revokedExport.text).not.toContain(judicialObservation); expect(revokedExport.text).not.toContain(question); expect(revokedExport.text).toContain(transcript);
    await page.reload();
    await openHearingPanel(workbench, "Conversación");
    await expect(workbench.locator(".hearing-turn")).toHaveCount(0);
    await expect(workbench.getByText("Conversación no disponible: alguno de sus respaldos o notas cambió de acceso.", { exact: true })).toBeVisible();
    await expect(workbench.getByText(judicialObservation, { exact: true })).toHaveCount(0);
    await closeHearingPanel(workbench);
    await expect(audioPanel.getByLabel("Transcripción de trabajo", { exact: true })).toBeVisible();
    await expect(audioPanel.getByLabel("Transcripción de trabajo", { exact: true })).toHaveValue(transcript);
    expect(unexpectedBrowserRequests).toBe(0);
  } finally { await otherContext.close(); }
});
