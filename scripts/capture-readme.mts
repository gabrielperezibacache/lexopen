/** Real product screenshots, isolated demo fixtures only. Never a production database. */
import { chromium, expect, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import { loginAs } from "../e2e/helpers";
import type { WritingMutationResult } from "../src/lib/writings/types";
import type { HearingLiveMutation, HearingLiveView } from "../src/lib/hearings/live-types";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3224";
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) throw Error("Screenshots require an isolated local server");
const databaseUrl = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).toString() !== databaseUrl) throw Error("DATABASE_URL must match E2E_DATABASE_URL");
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Screenshots require local disposable storage");
const captureStorage = path.resolve(process.env.STORAGE_PATH || "");
const temporaryRoots = [tmpdir(), "/tmp", "/private/tmp"].map(root => path.resolve(root));
if (!temporaryRoots.includes(path.dirname(captureStorage)) || !path.basename(captureStorage).startsWith("lexopen-readme-")) throw Error("Use a dedicated lexopen-readme-* directory directly inside the system temporary directory");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const output = path.resolve("docs/assets/screenshots");
const tag = randomUUID(), email = `readme-${tag}@example.test`, prefix = `readme/${tag}`;
let ownerId = "", causaId = "";
const documentIds: string[] = [], bookIds: string[] = [], storedKeys: string[] = [];
const captured: { file: string; route: string; viewport: { width: number; height: number }; description: string }[] = [];
async function json<T>(response: Pick<APIResponse, "status" | "text" | "json">, expected = 200): Promise<T> {
  if (response.status() !== expected) throw Error(`HTTP ${response.status()} (expected ${expected}): ${(await response.text()).slice(0, 1200)}`);
  return response.json();
}
async function capture(page: Page, file: string, description: string, selector?: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    (document.activeElement as HTMLElement)?.blur();
    await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); })));
  });
  if (selector) await page.locator(selector).evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 110), behavior: "instant" }));
  else await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: path.join(output, file), animations: "disabled" });
  captured.push({ file, route: new URL(page.url()).pathname.replace(causaId, "[causa]").replaceAll(/cm[a-z0-9]{20,}/g, "[id]"), viewport: page.viewportSize()!, description });
  console.log(`Captured ${file}`);
}
async function addDemoDocument(page: Page, name: string, text: string) {
  const key = `${prefix}/${documentIds.length}.txt`; storedKeys.push(key);
  await putObject({ key, body: text, contentType: "text/plain" });
  const row = await db.documento.create({ data: { nombre: name, tipo: "documento", mimeType: "text/plain", storageKey: key, contenido: text, extractedMarkdown: text, extractionStatus: "completed", causaId, autorId: ownerId } });
  documentIds.push(row.id);
  await json(await page.request.post(`/api/documentos/${row.id}/evidence`), 201);
  return { id: row.id, ...await json<{ selectedVersionId: string; fragments: { id: string; text: string }[] }>(await page.request.get(`/api/documentos/${row.id}/evidence`)) };
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const seeded = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  ownerId = (await db.user.create({ data: { email, name: "Isabel Fuentes · Demo", role: "abogado", password: seeded.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Cumplimiento de contrato · Demostración", rit: "DEMO C-1042-2026", tribunal: "Tribunal de demostración", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: "es-CL", reducedMotion: "reduce" });
  const page = await context.newPage();
  await loginAs(page, email);
  const agreement = await addDemoDocument(page, "Acuerdo de servicios · Demo.txt", "EXPEDIENTE DE DEMOSTRACIÓN\n\nEl 3 de agosto de 2026 las partes acordaron preparar y entregar un informe técnico. La entrega se programó para el 18 de septiembre de 2026. El presupuesto de demostración fue CLP 1.200.000.\n\nEste texto es un ejemplo editorial creado para mostrar la gestión de fuentes de LexOpen; no reproduce un contrato ni una causa reales.");
  const delivery = await addDemoDocument(page, "Constancia de entrega · Demo.txt", "CONSTANCIA · DOCUMENTO DE DEMOSTRACIÓN\n\nEl informe técnico fue entregado el 18 de septiembre de 2026. La coordinación recibió una copia digital y dejó constancia de recepción el mismo día. Queda pendiente cotejar el ejemplar firmado antes de la audiencia.\n\nDocumento y acontecimientos ficticios para ilustrar la aplicación.");
  await addDemoDocument(page, "Correo de coordinación · Demo.txt", "COORDINACIÓN · DEMOSTRACIÓN\n\nEl 21 de septiembre de 2026 se solicitó revisar la entrega del informe y preparar los comprobantes originales. Se acordó reunir la documentación antes de la reunión del equipo.\n\nMensaje demostrativo, sin destinatarios ni datos personales reales.");
  const pdfKey = `${prefix}/documento-demo.pdf`; storedKeys.push(pdfKey);
  await putObject({ key: pdfKey, body: await readFile("docs/assets/screenshots/demo-constancia.pdf"), contentType: "application/pdf" });
  const pdf = await db.documento.create({ data: { nombre: "Documento de muestra · PDF verificable.pdf", tipo: "documento", mimeType: "application/pdf", storageKey: pdfKey, causaId, autorId: ownerId } }); documentIds.push(pdf.id);
  await json(await page.request.post(`/api/documentos/${pdf.id}/evidence`), 201);
  const facts: { id: string; revision: number }[] = [];
  for (const [source, statement, date, literal] of [[agreement, "Las partes acordaron preparar y entregar un informe técnico.", "2026-08-03", "3 de agosto de 2026"], [delivery, "La constancia registra la entrega del informe técnico.", "2026-09-18", "18 de septiembre de 2026"]] as const) {
    const fact = await json<{ fact: { id: string; revision: number } }>(await page.request.post(`/api/causas/${causaId}/knowledge/facts`, { data: { statement, citations: [{ kind: "document", fragmentId: source.fragments[0].id, quote: source.fragments[0].text }], dateLiteral: literal, dateStart: date, dateEnd: date, datePrecision: "day", dateInferred: false } }), 201); facts.push(fact.fact);
  }
  await db.minuta.create({ data: { causaId, autorId: ownerId, tipo: "reunion", titulo: "Preparación de la audiencia · Demo", resumenEjecutivo: "Reunimos las fuentes y ordenamos los puntos que requieren revisión del equipo.", participantes: "Isabel Fuentes · Equipo de demostración", acuerdos: "Cotejar los originales y revisar la constancia de entrega.", acciones: { create: [{ descripcion: "Reunir el comprobante original", estado: "pendiente" }, { descripcion: "Revisar el borrador con sus fuentes", estado: "pendiente" }] } } });
  for (const [title, offset] of [["Revisar fuentes antes de audiencia", 3], ["Preparar presentación de antecedentes", 7], ["Seguimiento de entrega documental", 12]] as const) {
    const due = new Date(); due.setDate(due.getDate() + offset);
    await db.task.create({ data: { causaId, creatorId: ownerId, assigneeId: ownerId, title, description: "Actividad de demostración", dueDate: due, priority: "high" } });
    await db.plazo.create({ data: { causaId, responsableId: ownerId, titulo: `${title} · Demo`, descripcion: "Recordatorio demostrativo; no corresponde a un plazo procesal real.", fechaLimite: due, tipo: "interno", esFatal: false } });
  }
  for (const [title, color, shelf] of [["Cuaderno de práctica civil", "oxblood", "Cuadernos de demostración"], ["Lectura de contratos", "forest", "Cuadernos de demostración"], ["Preparación de audiencias", "navy", "Cuadernos de demostración"], ["Fuentes y prueba documental", "cognac", "Cuadernos de demostración"], ["Escritura jurídica", "ivory", "Cuadernos de demostración"], ["Cronología del expediente", "charcoal", "Cuadernos de demostración"]] as const) {
    const text = `${title.toUpperCase()}\n\nCUADERNO DE DEMOSTRACIÓN\n\nEste volumen ilustrativo reúne apuntes de trabajo para mostrar la biblioteca personal de LexOpen. No es una obra jurídica publicada ni una fuente de autoridad.\n\nMétodo de lectura: conserve el original, identifique cada pasaje y revise su pertinencia antes de incorporarlo a una presentación. Un comentario del profesional debe distinguirse del texto de su fuente.\n\nContenido de muestra redactado para estas capturas.`;
    const imported = await json<{ book: { id: string } }>(await page.request.post("/api/books", { multipart: { requestId: randomUUID(), title, author: "Colección de demostración", year: "2026", coverColor: color, coverStyle: "leather", shelf, preserveOriginal: "true", convertToText: "false", file: { name: `${title}.txt`, mimeType: "text/plain", buffer: Buffer.from(text) } } }), 201); bookIds.push(imported.book.id);
  }
  storedKeys.push(...(await db.libraryBook.findMany({ where: { id: { in: bookIds } }, select: { storageKey: true } })).map(row => row.storageKey));
  await json(await page.request.patch("/api/books/preferences", { data: { libraryName: "Biblioteca de Isabel", shelfTheme: "walnut", view: "covers", layout: "estantes" } }));
  const workspace = await json<{ id: string }>(await page.request.post(`/api/causas/${causaId}/hearings`, { data: { title: "Audiencia preparatoria · Demostración", scheduledFor: "2026-11-16T13:00:00Z" } }), 201);
  const source = await json<{ id: string }>(await page.request.post(`/api/causas/${causaId}/hearings/${workspace.id}/sources`, { data: { kind: "document", refId: delivery.id } }));
  const reading = await json<{ fragments: { id: string; text: string }[] }>(await page.request.get(`/api/causas/${causaId}/hearings/${workspace.id}/sources/${source.id}/read`));
  const citation = { sourceId: source.id, fragmentId: reading.fragments[0].id, quote: reading.fragments[0].text };
  const notes: { id: string; revision: number }[] = [];
  for (const [title, body] of [["Presentar la constancia de entrega", "Distinguir la entrega registrada de los puntos que aún necesitan cotejo del original."], ["Solicitar revisión del ejemplar firmado", "Precisar qué antecedente falta y dejarlo registrado como asunto pendiente."], ["Preparar los próximos pasos", "Conservar las notas y las fuentes para continuar el escrito después de la audiencia."]]) notes.push(await json(await page.request.post(`/api/causas/${causaId}/hearings/${workspace.id}/notes`, { data: { title, body, citation } })));
  let live = await json<HearingLiveView>(await page.request.get(`/api/causas/${causaId}/hearings/${workspace.id}/live`));
  live = (await json<HearingLiveMutation>(await page.request.patch(`/api/causas/${causaId}/hearings/${workspace.id}/live`, { data: { requestId: randomUUID(), expectedRevision: live.revision, opening: "Solicitar que se tengan presentes los antecedentes reunidos y los puntos pendientes de revisión.", closing: "Dejar constancia de los acuerdos y preparar la continuidad del expediente.", noteIds: notes.map(note => note.id), noteRevisions: Object.fromEntries(notes.map(note => [note.id, note.revision])), addressedNoteIds: [], activeNoteId: notes[0].id } }))).live;
  live = (await json<HearingLiveMutation>(await page.request.post(`/api/causas/${causaId}/hearings/${workspace.id}/live/control`, { data: { requestId: randomUUID(), expectedRevision: live.revision, action: "start" } }))).live;
  await json(await page.request.post(`/api/causas/${causaId}/hearings/${workspace.id}/live/entries`, { data: { requestId: randomUUID(), expectedRevision: live.revision, kind: "commitment", title: "Revisar el respaldo documental", body: "Se deja una nota de trabajo para contrastar el ejemplar firmado y actualizar el borrador. Registro demostrativo.", citation } }), 201);
  const created = await json<WritingMutationResult>(await page.request.post(`/api/causas/${causaId}/writings`, { data: { requestId: randomUUID(), title: "Presentación de antecedentes · Demo", body: "EN LO PRINCIPAL: acompaña antecedentes.\n\nSe solicita tener presente la constancia de entrega incorporada al expediente, conservando su referencia para revisión profesional.\n\nPRIMER OTROSÍ: se solicita cotejar el ejemplar firmado antes de la audiencia.\n\nBorrador demostrativo. Su contenido no corresponde a una presentación judicial real." } }), 201);
  const draft = await json<WritingMutationResult>(await page.request.post(`/api/causas/${causaId}/writings/${created.draft.id}/sources`, { data: { requestId: randomUUID(), expectedRevision: created.draft.revision, source: { kind: "fact", factId: facts[1].id, revision: facts[1].revision } } }));

  await page.goto(`/causas/${causaId}`); await expect(page.getByTestId("case-preparation")).toBeVisible();
  await capture(page, "causa.png", "Preparación de una causa, índice de fuentes y próximos pasos", "#preparacion");
  await page.goto("/biblioteca"); await expect(page.getByTestId("library-book")).toHaveCount(6);
  await capture(page, "biblioteca.png", "Biblioteca personal con seis volúmenes demostrativos y estantes personalizables");
  await page.goto(`/causas/${causaId}/escritos?draft=${draft.draft.id}`);
  await expect(page.getByTestId("writing-editor").getByLabel("Texto del escrito", { exact: true })).toHaveValue(/EN LO PRINCIPAL/);
  await page.getByTestId("writing-editor").getByRole("tab", { name: "Referencias (1)", exact: true }).click();
  await capture(page, "escrito.png", "Editor privado por causa con guardado, historial y referencias verificadas", ".writing-layout");
  await page.goto(`/documentos/${pdf.id}/fuentes`); await expect(page.getByRole("heading", { name: "Documento de muestra · PDF verificable.pdf", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Página 1 de/ })).toBeVisible();
  await capture(page, "lector-pdf.png", "Lector de PDF con página física, texto extraído y localizadores", ".evidence-reader figure");
  await page.goto(`/causas/${causaId}/audiencias?mesa=${workspace.id}`); await page.getByRole("button", { name: "En vivo", exact: true }).click();
  await expect(page.getByTestId("hearing-live-clock")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comprobar servicio de transcripción", exact: true })).toHaveCount(0);
  await capture(page, "audiencia.png", "Mesa de audiencia en vivo con lector, guion, control de sesión y registro", ".hearing-desk");
  await page.goto(`/causas/${causaId}`); await page.getByRole("button", { name: "Abrir conocimiento del expediente", exact: true }).click();
  await page.locator("#conocimiento").getByRole("button", { name: "Cronología", exact: true }).click();
  await expect(page.locator(".knowledge-chronology")).toContainText("constancia");
  await capture(page, "cronologia.png", "Cronología con afirmaciones ligadas a fuentes, fechas y estado de revisión", "#conocimiento");
  await page.goto("/dashboard"); await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await capture(page, "dashboard.png", "Vista operativa del estudio y sus asuntos de demostración");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biblioteca"); await expect(page.getByTestId("library-book")).toHaveCount(6);
  await capture(page, "movil.png", "La misma biblioteca adaptada a una pantalla móvil");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await capture(page, "biblioteca-oscura.png", "Biblioteca personal en modo oscuro");
  const manifest = { capturedAt: new Date().toISOString(), applicationRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), source: "Screenshots taken directly from the running LexOpen application through Chromium. No compositing or image generation.", data: "Isolated demonstration database. All people, books, case events, documents and titles shown are illustrative, not actual clients or published legal authorities.", screenshots: await Promise.all(captured.map(async item => ({ ...item, sha256: createHash("sha256").update(await readFile(path.join(output, item.file))).digest("hex") }))) };
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  // The screenshot guide is maintained separately; regenerate only images and manifest.
  console.log(`Saved ${captured.length} real application screenshots`);
} finally {
  await browser.close();
  if (causaId) { await db.caseWritingDraft.deleteMany({ where: { causaId } }); await db.hearingWorkspace.deleteMany({ where: { causaId } }); await db.caseFact.deleteMany({ where: { causaId } }); await db.task.deleteMany({ where: { causaId } }); await db.documento.deleteMany({ where: { causaId } }); await db.causa.deleteMany({ where: { id: causaId } }); }
  if (bookIds.length) await db.libraryBook.deleteMany({ where: { id: { in: bookIds } } });
  if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.userBookPreference.deleteMany({ where: { userId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
  for (const key of storedKeys) await rm(path.join(process.env.STORAGE_PATH!, key), { force: true });
  for (const id of documentIds) await rm(path.join(process.env.STORAGE_PATH!, "evidence", encodeURIComponent(id)), { recursive: true, force: true });
  await db.$disconnect();
}
