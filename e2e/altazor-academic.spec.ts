/** Real UI/API/database/storage; the only model is an explicitly fictitious loopback HTTP server. */
import { expect, test } from "@playwright/test";
import { PrismaClient, type IntegrationConfig } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { assertAcademicDocx } from "../src/lib/workbench/docx";
import { assertWritingDocx } from "../src/lib/writings/docx";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), storage = process.env.STORAGE_PATH;
if (new URL(process.env.DATABASE_URL!).toString() !== database || !storage || !path.isAbsolute(storage) || [process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Use an explicitly disposable local database and storage");
const db = new PrismaClient({ datasources: { db: { url: database } } });
const tag = randomUUID(), email = `altazor-academic-${tag}@example.invalid`, sourceText = "La investigación jurídica debe distinguir fuentes, inferencias y límites. Material completamente ficticio para esta prueba.";
let server: Server | undefined, ownerId = "", causaId = "", configCaptured = false, previousConfig: IntegrationConfig[] = [];
const requests: { role: string; content: string }[][] = [];
test.use({ actionTimeout: 15_000, colorScheme: "dark" });

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(body.messages);
    const content = JSON.stringify({ sections: [{ heading: "Lectura ficticia", text: "La lectura distingue «fuentes, inferencias y límites» como una pauta ficticia para revisión profesional.", referenceIds: ["R1"] }] });
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw Error("The fictitious model needs a loopback TCP port");
  previousConfig = await db.integrationConfig.findMany({ where: { provider: { in: ["llm", "hermes"] } } }); configCaptured = true;
  const configJson = JSON.stringify({ preset: "custom", apiUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "", model: "fictitious-academic-browser", requireApproval: true, allowDemo: false });
  for (const provider of ["llm", "hermes"]) await db.integrationConfig.upsert({ where: { provider }, create: { provider, enabled: true, configJson }, update: { enabled: true, configJson } });
  const user = await db.user.create({ data: { email, name: "Profesional académico ficticio", role: "abogado", password: await hash("lexopen", 10) } }); ownerId = user.id;
  causaId = (await db.causa.create({ data: { titulo: `Causa académica ficticia ${tag}`, tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
});

test.afterAll(async () => {
  try {
    if (configCaptured) {
      await db.integrationConfig.deleteMany({ where: { provider: { in: ["llm", "hermes"] }, id: { notIn: previousConfig.map(row => row.id) } } });
      for (const row of previousConfig) await db.integrationConfig.upsert({ where: { provider: row.provider }, create: row, update: { enabled: row.enabled, configJson: row.configJson, updatedAt: row.updatedAt } });
    }
    if (ownerId) {
      const books = await db.libraryBook.findMany({ where: { ownerId }, select: { id: true } });
      await db.externalShareDraft.deleteMany({ where: { ownerId } });
      await db.caseWritingDraft.deleteMany({ where: { ownerId } });
      await db.commandExecution.deleteMany({ where: { ownerId } });
      await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId } });
      await db.libraryBook.deleteMany({ where: { ownerId } });
      if (causaId) await db.causa.deleteMany({ where: { id: causaId } });
      await db.activity.deleteMany({ where: { userId: ownerId } });
      await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await db.user.deleteMany({ where: { id: ownerId } });
      for (const book of books) {
        if (!/^book_[a-f0-9]{40}$/.test(book.id)) throw Error("Unexpected fixture book identifier");
        await rm(path.join(storage!, "library-books", book.id), { recursive: true, force: true });
      }
    }
  } finally { server?.closeAllConnections(); await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await db.$disconnect(); }
});

test("Academia: fuente elegida, propuesta local, revisión, exportación y escrito nativo conservan respaldo", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const origin = new URL(testInfo.project.use.baseURL as string).origin, blocked: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    blocked.push(url.hostname); return route.abort("blockedbyclient");
  });
  await loginAs(page, email);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value; expect(csrf).toBeTruthy();
  const mutationHeaders = { Origin: origin, [CSRF_HEADER]: csrf! };
  const uploaded = await page.request.post("/api/books", { headers: mutationHeaders, multipart: { requestId: randomUUID(), title: "Lectura académica ficticia", author: "Autor de prueba", year: "2026", file: { name: "lectura-ficticia.txt", mimeType: "text/plain", buffer: Buffer.from(sourceText) } } });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const book = (await uploaded.json()).book as { id: string; revision: number };
  await page.goto("/academico");
  const academic = page.getByRole("region", { name: "Desarrollo académico", exact: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(academic.getByText("Abriendo tus trabajos académicos…", { exact: true })).toBeHidden();
  const newWork = academic.getByRole("button", { name: "Nuevo trabajo", exact: true });
  if (await newWork.isVisible()) await newWork.click();
  await expect(academic.getByRole("button", { name: /Investigar/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("academico-midnight-escritorio.png") });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(academic.getByRole("button", { name: /Enseñar/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("academico-midnight-movil.png") });
  await academic.getByLabel("Nombre del trabajo", { exact: true }).fill("Síntesis académica ficticia");
  await academic.getByRole("button", { name: "Crear trabajo", exact: true }).click();
  await expect(academic.getByText("Trabajo creado. Comienza por tu objetivo.", { exact: true })).toBeVisible();
  const workspace = await db.altazorAcademicWorkspace.findFirstOrThrow({ where: { ownerId } });
  await academic.getByText("Opciones del trabajo", { exact: true }).click();
  await academic.getByLabel("Qué quieres preparar", { exact: true }).selectOption("synthesis");
  await academic.getByLabel("Tu objetivo o texto de trabajo", { exact: true }).fill("Organiza el pasaje ficticio seleccionado como una propuesta breve para revisión humana.");
  await academic.getByRole("button", { name: "Guardar y elegir fuentes", exact: true }).click();
  const picker = academic.getByRole("region", { name: "Fuentes para ALTAZOR" });
  await expect(picker.locator(`option[value="${book.id}"]`)).toHaveCount(1);
  await picker.getByRole("combobox", { name: /^Libro/ }).selectOption(book.id);
  await expect(picker.locator(".altazor-source-quote")).toContainText(sourceText);
  await picker.getByRole("checkbox").check();
  await academic.getByRole("button", { name: "Guardar fuentes y continuar", exact: true }).click();
  await page.reload();
  await expect(academic.getByLabel("Qué quieres preparar", { exact: true })).toHaveValue("synthesis");
  await academic.getByRole("button", { name: "Trabajo", exact: true }).click();
  await expect(academic.getByText("1 pasaje elegido", { exact: false })).toBeVisible();
  await expect(academic.getByRole("checkbox", { name: /Autorizo enviar el encargo/ })).toHaveCount(0);
  await academic.getByRole("button", { name: "Preparar propuesta", exact: true }).click();
  const editor = academic.getByRole("region", { name: "Editor académico" }), prose = editor.getByRole("textbox", { name: "Texto de trabajo", exact: true });
  await expect(prose).toHaveValue(/\[R1\]/, { timeout: 25_000 });
  expect(requests).toHaveLength(1); expect(JSON.stringify(requests[0])).toContain(sourceText);
  const generated = await prose.inputValue(), reviewed = `${generated}\n\nObservación personal revisada.`;
  const original = await db.altazorAcademicArtifact.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  const exportPath = `/api/altazor/academic/${workspace.id}/artifacts/${original.id}/export`;
  const firstExport = await page.request.get(`${exportPath}?format=md&revision=1`);
  expect(firstExport.status()).toBe(200);
  expect(await firstExport.text()).toBe(generated);
  expect(await db.altazorAcademicArtifactVersion.count({ where: { artifactId: original.id } })).toBe(0);
  await prose.fill(reviewed);
  await academic.getByRole("checkbox", { name: "He revisado este contenido y sus fuentes", exact: true }).check();
  await expect(editor.getByText("Guardado", { exact: true })).toBeVisible();
  const artifact = await db.altazorAcademicArtifact.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  expect(artifact.status).toBe("reviewed"); expect(artifact.body).toBe(reviewed);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("academico-editor-midnight.png") });
  const markdownDownload = page.waitForEvent("download"); await academic.getByRole("link", { name: "Markdown", exact: true }).click();
  const markdownPath = testInfo.outputPath("propuesta-academica-ficticia.md"); await (await markdownDownload).saveAs(markdownPath);
  expect(await readFile(markdownPath, "utf8")).toBe(reviewed);
  const wordDownload = page.waitForEvent("download"); await academic.getByRole("link", { name: "Descargar Word", exact: true }).click();
  const wordPath = testInfo.outputPath("propuesta-academica-ficticia.docx"); await (await wordDownload).saveAs(wordPath); assertAcademicDocx(await readFile(wordPath));
  await editor.getByText("Incorporar o compartir una revisión", { exact: true }).click();
  await academic.getByRole("button", { name: "Preparar para LinkedIn", exact: true }).click();
  await expect(academic.getByText(/Borrador privado conservado en Conexiones/)).toBeVisible();
  const share = await db.externalShareDraft.findFirstOrThrow({ where: { ownerId } }); expect(JSON.parse(share.originJson)).toMatchObject({ kind: "academic", workspaceId: workspace.id, artifactId: artifact.id, revision: artifact.revision });
  await academic.getByRole("combobox", { name: "Causa de destino", exact: true }).selectOption(causaId);
  await academic.getByRole("button", { name: "Incorporar a la causa", exact: true }).click();
  const writing = academic.getByRole("link", { name: "Abrir escrito incorporado", exact: true }); await expect(writing).toBeVisible();
  const draftId = new URL((await writing.getAttribute("href"))!, origin).searchParams.get("draft"); expect(draftId).toBeTruthy();
  const native = await page.request.get(`/api/causas/${causaId}/writings/${draftId}/export?format=markdown`); expect(native.status(), await native.text()).toBe(200);
  const nativeText = await native.text(); expect(nativeText).toContain("[^R1]"); expect(nativeText).toContain("[^R1]:"); expect(nativeText).not.toContain("fuentes incorporadas cuyo marcador no aparece");
  const nativeWord = await page.request.get(`/api/causas/${causaId}/writings/${draftId}/export?format=docx`);
  expect(nativeWord.status(), await nativeWord.text().catch(() => "")).toBe(200); assertWritingDocx(await nativeWord.body());
  await page.reload(); await expect(prose).toHaveValue(reviewed);
  await editor.getByRole("button", { name: "Historial", exact: true }).click();
  await editor.getByRole("button", { name: /^Versión 1 ·/ }).click();
  const oldWord = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descargar versión 1 en Word", exact: true }).click();
  const oldWordFile = await oldWord;
  expect(oldWordFile.suggestedFilename()).toBe(`altazor-${artifact.id}-v1.docx`);
  const oldWordBytes = await readFile((await oldWordFile.path())!);
  assertAcademicDocx(oldWordBytes);
  expect(oldWordBytes.includes(Buffer.from("Lectura ficticia"))).toBe(true);
  expect(oldWordBytes.includes(Buffer.from("Observación personal revisada."))).toBe(false);
  // A newer unsaved edit must not replace the selected historical version or
  // become part of its download. Keep the autosave offline in this scenario.
  const artifactRoute = `**/api/altazor/academic/${workspace.id}/artifacts/${artifact.id}`;
  await page.route(artifactRoute, route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 503, json: { error: "Guardado ficticio en pausa" } })
    : route.fallback());
  const pending = `${reviewed}\n\nApunte sin guardar.`;
  await prose.fill(pending);
  const oldMarkdown = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descargar versión 1 en Markdown", exact: true }).click();
  const oldMarkdownFile = await oldMarkdown;
  expect(oldMarkdownFile.suggestedFilename()).toBe(`altazor-${artifact.id}-v1.md`);
  expect(await readFile((await oldMarkdownFile.path())!, "utf8")).toBe(generated);
  await expect(prose).toHaveValue(pending);
  const references = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Descargar fuentes de la versión", exact: true }).click();
  const referencesFile = await references;
  expect(referencesFile.suggestedFilename()).toBe(`altazor-${artifact.id}-v1-fuentes.md`);
  const referenceText = await readFile((await referencesFile.path())!, "utf8");
  expect(referenceText).toContain("# Fuentes de la versión 1");
  expect(referenceText).toContain("[R1] Lectura académica ficticia");
  expect(referenceText).toContain(sourceText);
  expect(referenceText).not.toContain("Apunte sin guardar.");
  expect((await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: artifact.id } })).body).toBe(reviewed);
  await prose.fill(reviewed);
  await editor.getByRole("checkbox", { name: "He revisado este contenido y sus fuentes" }).check();
  await page.unroute(artifactRoute);
  expect((await page.request.get(`${exportPath}?format=md&revision=0`)).status()).toBe(400);
  expect((await page.request.get(`${exportPath}?format=md&revision=1&revision=2`)).status()).toBe(400);
  expect((await page.request.get(`${exportPath}?format=md&revision=500`)).status()).toBe(404);
  await editor.getByRole("button", { name: "Recuperar como nueva revisión", exact: true }).click();
  await expect(prose).toHaveValue(generated);
  await expect(editor.getByRole("checkbox", { name: "He revisado este contenido y sus fuentes" })).not.toBeChecked();
  expect((await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: artifact.id } })).revision).toBe(artifact.revision + 1);
  const current = await page.request.get(`/api/books/${book.id}`); expect(current.status()).toBe(200);
  const currentBook = (await current.json()).book;
  expect((await page.request.delete(`/api/books/${book.id}`, { headers: mutationHeaders, data: { revision: currentBook.revision } })).status()).toBe(200);
  expect([404, 409]).toContain((await page.request.get(`/api/altazor/academic/${workspace.id}/artifacts/${artifact.id}/export?format=md`)).status());
  for (const format of ["md", "docx", "references"]) {
    const denied = await page.request.get(`${exportPath}?format=${format}&revision=1`);
    expect([404, 409]).toContain(denied.status());
    expect(denied.headers()["content-disposition"]).toBeUndefined();
  }
  expect(requests).toHaveLength(1); expect(blocked).toEqual([]);
});

test("Docencia arma un syllabus editable desde la ficha y separa la consulta bibliográfica", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await loginAs(page, email);
  const initialRequests = requests.length;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/academico");
  const academic = page.getByRole("region", { name: "Desarrollo académico" });
  await academic.getByRole("button", { name: "Docencia", exact: true }).click();
  await expect(academic.getByRole("heading", { name: "Docencia y encuentros" })).toBeVisible();
  for (const label of ["Seminario", "Congreso", "Taller", "Convocatoria"]) {
    await expect(academic.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("docencia-movil.png") });
  await academic.getByRole("button", { name: /^Curso / }).click();
  await academic.getByLabel("Nombre del trabajo", { exact: true }).fill("Curso ficticio de argumentación");
  await academic.getByRole("button", { name: "Crear trabajo", exact: true }).click();
  const ficha = academic.getByRole("region", { name: "Ficha para el syllabus" });
  await ficha.getByLabel("Resumen del curso").fill("Analizar y discutir argumentos a partir de un caso ficticio.");
  await ficha.getByLabel("Enfoque y metodología").fill("Lectura previa y discusión guiada.");
  await ficha.getByLabel("Horario").fill("Lunes de 16:00 a 17:30");
  await ficha.getByLabel("Sala o modalidad").fill("Aula 204");
  await ficha.getByLabel("Exigencias y requisitos").fill("Lecturas previas a cada sesión.");
  await ficha.getByLabel("Resultados de aprendizaje").fill("Distinguir premisas y conclusiones.");
  await ficha.getByLabel("Bibliografía base").fill("Autora de prueba. Lectura base ficticia.");
  await ficha.getByRole("button", { name: "Pedir bibliografía a Altazor" }).click();
  const chat = page.getByRole("dialog", { name: "ALTAZOR" });
  await expect(chat.getByRole("textbox", { name: "Mensaje para ALTAZOR" })).toHaveValue(/Sugiere bibliografía para el curso «Curso ficticio de argumentación»/);
  await expect(chat.getByRole("textbox", { name: "Mensaje para ALTAZOR" })).not.toHaveValue(/Lectura base ficticia|Aula 204/);
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  const agenda = academic.getByRole("region", { name: "Actividades en mi Agenda" });
  for (const [name, date] of [["Sesión de fuentes jurídicas", "2030-05-09"], ["Sesión de ejercicios internos", "2030-05-16"]]) {
    await agenda.getByRole("textbox", { name: "Nombre de la actividad", exact: true }).fill(name);
    await agenda.getByLabel("Inicio", { exact: true }).fill(`${date}T16:30`);
    await agenda.getByLabel("Término (opcional)", { exact: true }).fill(`${date}T17:30`);
    await agenda.getByRole("button", { name: "Agregar a mi Agenda", exact: true }).click();
    await expect(agenda.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
  const lesson = agenda.getByRole("listitem").filter({ hasText: "Sesión de fuentes jurídicas" });
  await lesson.getByText("Contenido de la sesión", { exact: true }).click();
  await lesson.getByRole("button", { name: "Editar contenido", exact: true }).click();
  await expect(lesson.getByRole("button", { name: "Guardar contenido", exact: true })).toBeDisabled();
  await expect(ficha.getByRole("button", { name: "Crear syllabus" })).toBeEnabled();
  await lesson.getByText("Ponentes, moderación y lugar", { exact: true }).click();
  await expect(lesson.getByRole("button", { name: "Guardar contenido", exact: true })).toBeDisabled();
  await expect(ficha.getByRole("button", { name: "Crear syllabus" })).toBeEnabled();
  await lesson.getByRole("button", { name: "Añadir ponente", exact: true }).click();
  await lesson.getByLabel("Nombre del ponente 1", { exact: true }).fill("Profesora ficticia de fuentes");
  await lesson.getByRole("button", { name: "Añadir moderador", exact: true }).click();
  await lesson.getByLabel("Nombre del moderador 1", { exact: true }).fill("Moderador ficticio de la clase");
  await lesson.getByLabel("Sala o modalidad de la sesión", { exact: true }).fill("Aula 305 · presencial");
  await lesson.getByText("Actividad para participantes", { exact: true }).click();
  await lesson.getByLabel("Consigna de la actividad", { exact: true }).fill("Identifica las fuentes del caso.\nJustifica la selección en dos párrafos.");
  await lesson.getByRole("button", { name: "Añadir lectura", exact: true }).click();
  await lesson.getByLabel("Título de la lectura 1", { exact: true }).fill("Lectura asignada sobre fuentes");
  await lesson.getByLabel("Enlace de la lectura 1 (opcional)", { exact: true }).fill(`${new URL(testInfo.project.use.baseURL as string).origin}/biblioteca/libro-prueba?fragment=2#fragment-2`);
  await lesson.getByRole("button", { name: "Añadir material", exact: true }).click();
  await lesson.getByLabel("Título del material 1", { exact: true }).fill("Guía ficticia de análisis");
  await lesson.getByLabel("Enlace del material 1 (opcional)", { exact: true }).fill("https://example.invalid/materiales/guia");
  await lesson.getByRole("button", { name: "Añadir resultado", exact: true }).click();
  await lesson.getByLabel("Resultado de aprendizaje 1", { exact: true }).fill("Clasificar las fuentes de un caso.");
  await expect(ficha.getByRole("button", { name: "Crear syllabus" })).toBeDisabled();
  await lesson.getByRole("button", { name: "Guardar contenido", exact: true }).click();
  await expect(ficha.getByRole("button", { name: "Crear syllabus" })).toBeEnabled();
  await expect(lesson.getByRole("link", { name: "Lectura asignada sobre fuentes", exact: true }))
    .toHaveAttribute("href", "/biblioteca/libro-prueba?fragment=2#fragment-2");
  await expect(lesson.getByRole("link", { name: "Guía ficticia de análisis", exact: true }))
    .toHaveAttribute("href", "https://example.invalid/materiales/guia");
  await expect(lesson.getByText("Profesora ficticia de fuentes", { exact: true })).toBeVisible();
  await expect(lesson.getByText("Moderador ficticio de la clase", { exact: true })).toBeVisible();
  await expect(lesson.getByText("Aula 305 · presencial", { exact: true })).toBeVisible();
  await expect(lesson.getByText("Identifica las fuentes del caso. Justifica la selección en dos párrafos.", { exact: true })).toBeVisible();
  if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
    await lesson.screenshot({ path: testInfo.outputPath("contenido-sesion-movil.png") });
  }

  const picker = ficha.locator("#syllabus-agenda");
  await picker.getByText("Sesiones de la Agenda", { exact: true }).click();
  const selectedLesson = picker.getByRole("checkbox", { name: /Sesión de fuentes jurídicas/ });
  const otherLesson = picker.getByRole("checkbox", { name: /Sesión de ejercicios internos/ });
  await selectedLesson.check();
  await expect(otherLesson).not.toBeChecked();
  await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
  await page.reload();
  await picker.getByText("Sesiones de la Agenda", { exact: true }).click();
  await expect(selectedLesson).toBeChecked();
  await expect(otherLesson).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
    await page.setViewportSize({ width: 1280, height: 880 });
    await picker.screenshot({ path: testInfo.outputPath("seleccion-syllabus-escritorio.png") });
    await page.setViewportSize({ width: 360, height: 800 });
  }

  await ficha.getByRole("button", { name: "Crear syllabus" }).click();
  const editor = academic.getByRole("region", { name: "Editor académico" });
  const prose = editor.getByRole("textbox", { name: "Texto de trabajo", exact: true });
  await expect(prose).toHaveValue(/## Horario y sala\n\nLunes de 16:00 a 17:30\n\nAula 204/);
  const initial = await prose.inputValue();
  expect(initial).toContain("## Bibliografía base\n\nAutora de prueba. Lectura base ficticia.");
  expect(initial).toContain("Distinguir premisas y conclusiones.");
  expect(initial).toContain("Sesión de fuentes jurídicas");
  expect(initial).toContain("Lectura asignada sobre fuentes");
  expect(initial).toContain("/biblioteca/libro-prueba?fragment=2#fragment-2");
  expect(initial).toContain("Guía ficticia de análisis");
  expect(initial).toContain("Clasificar las fuentes de un caso.");
  expect(initial).toContain("Profesora ficticia de fuentes");
  expect(initial).toContain("Moderador ficticio de la clase");
  expect(initial).toContain("Aula 305 · presencial");
  expect(initial).toContain("Identifica las fuentes del caso.\nJustifica la selección en dos párrafos.");
  expect(initial).not.toContain("Sesión de ejercicios internos");
  expect(initial).not.toContain("Sugiere bibliografía");
  const workspace = await db.altazorAcademicWorkspace.findFirstOrThrow({ where: { ownerId, title: "Curso ficticio de argumentación" } });
  const artifact = await db.altazorAcademicArtifact.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  const retry = await page.request.post(`/api/altazor/academic/${workspace.id}/artifacts/draft`, {
    headers: { Origin: new URL(testInfo.project.use.baseURL as string).origin, [CSRF_HEADER]: csrf! },
    data: { requestId: artifact.requestId, expectedRevision: workspace.revision, template: "course" },
  });
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toEqual({ id: artifact.id, reused: true });
  const saved = `${initial}\n\n**Nota docente añadida al borrador.**`;
  await prose.fill(saved);
  await expect(editor.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await expect(prose).toHaveValue(saved);
  expect(requests).toHaveLength(initialRequests);
});

test("Docencia conserva el país, las bases y el estado de una convocatoria", async ({ page }) => {
  await loginAs(page, email);
  await page.goto("/academico");
  const academic = page.getByRole("region", { name: "Desarrollo académico" });
  await academic.getByRole("button", { name: "Docencia", exact: true }).click();
  await academic.getByRole("button", { name: /^Convocatoria / }).click();
  await academic.getByLabel("Nombre del trabajo", { exact: true }).fill("Fondo ficticio de investigación");
  await academic.getByRole("button", { name: "Crear trabajo", exact: true }).click();
  const fiche = academic.getByRole("region", { name: "Ficha de la convocatoria" });
  await fiche.getByLabel("País", { exact: true }).selectOption("CL");
  await fiche.getByLabel("Organismo convocante").fill("Institución ficticia");
  await fiche.getByLabel("Fecha de cierre").fill("2030-05-16");
  await fiche.getByLabel("Estado", { exact: true }).selectOption("preparing");
  await fiche.getByLabel("Enlace a las bases").fill("https://example.invalid/bases");
  await academic.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(academic.getByText("Objetivo y cambios guardados.")).toBeVisible();
  await page.reload();
  await academic.getByRole("button", { name: "Docencia", exact: true }).click();
  const calls = academic.getByRole("region", { name: "Mis convocatorias" });
  await calls.getByLabel("Filtrar por país").selectOption("CL");
  const card = calls.getByRole("button", { name: /Fondo ficticio de investigación/ });
  await expect(card).toContainText("Chile · Preparando postulación · Cierre 2030-05-16");
  await card.click();
  await expect(fiche.getByLabel("Enlace a las bases")).toHaveValue("https://example.invalid/bases");
  const agenda = academic.getByRole("region", { name: "Actividades en mi Agenda" });
  await expect(agenda.getByLabel("Fecha en Santiago")).toHaveValue("2030-05-16");
  await agenda.getByLabel("Fecha en Santiago").fill("2030-05-15");
  await agenda.getByLabel("Hora en Santiago").fill("16:30");
  await agenda.getByRole("button", { name: "Agregar cierre a mi Agenda" }).click();
  await expect(agenda.getByText("El cierre está registrado en tu Agenda de LexOpen.")).toBeVisible();
  await agenda.getByLabel("Hora en Santiago").fill("17:45");
  await agenda.getByRole("button", { name: "Actualizar cierre en mi Agenda" }).click();
  await expect(agenda.getByText("El cierre está registrado en tu Agenda de LexOpen.")).toBeVisible();
  await expect(agenda.getByText("Cierre · Fondo ficticio de investigación", { exact: true })).toHaveCount(1);
  const download = page.waitForEvent("download");
  await agenda.getByRole("link", { name: "Descargar agenda (.ics)" }).click();
  const exportFile = await download;
  const content = await readFile((await exportFile.path())!, "utf8");
  expect(exportFile.suggestedFilename()).toBe("lexopen-docencia.ics");
  expect(content).toContain("SUMMARY:Cierre · Fondo ficticio de investigación");
  expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
});
