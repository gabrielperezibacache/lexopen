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
import { assertPlainDocx } from "../src/lib/workbench/docx";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), storage = process.env.STORAGE_PATH;
if (new URL(process.env.DATABASE_URL!).toString() !== database || !storage || !path.isAbsolute(storage) || [process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Use an explicitly disposable local database and storage");
const db = new PrismaClient({ datasources: { db: { url: database } } });
const tag = randomUUID(), email = `altazor-academic-${tag}@example.invalid`, sourceText = "La investigación jurídica debe distinguir fuentes, inferencias y límites. Material completamente ficticio para esta prueba.";
let server: Server | undefined, ownerId = "", causaId = "", configCaptured = false, previousConfig: IntegrationConfig[] = [];
const requests: { role: string; content: string }[][] = [];
test.use({ actionTimeout: 15_000 });

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
  await page.locator(".altazor-tabs").getByRole("button", { name: "Academia", exact: true }).click();
  const academic = page.getByRole("region", { name: "Desarrollo académico", exact: true });
  await academic.getByText("Crear trabajo", { exact: true }).click();
  await academic.getByLabel("Título", { exact: true }).fill("Síntesis académica ficticia");
  await academic.getByRole("button", { name: "Crear y guardar", exact: true }).click();
  await expect(academic.getByRole("status")).toContainText("Trabajo creado y guardado");
  const workspace = await db.altazorAcademicWorkspace.findFirstOrThrow({ where: { ownerId } });
  await academic.locator(".altazor-source-disclosure > summary").click();
  const picker = academic.getByRole("region", { name: "Fuentes para ALTAZOR" });
  await expect(picker.locator(`option[value="${book.id}"]`)).toHaveCount(1);
  await picker.getByRole("combobox", { name: /^Libro/ }).selectOption(book.id);
  await expect(picker.locator(".altazor-source-quote")).toContainText(sourceText);
  await picker.getByRole("checkbox").check();
  await academic.getByLabel("Instrucciones o texto de trabajo", { exact: true }).fill("Organiza el pasaje ficticio seleccionado como una propuesta breve para revisión humana.");
  const consent = academic.getByRole("checkbox", { name: /Autorizo enviar las instrucciones/ }); if (await consent.count()) await consent.check();
  await academic.getByRole("button", { name: "Preparar propuesta", exact: true }).click();
  const prose = academic.getByRole("textbox", { name: "Propuesta editable", exact: true });
  await expect(prose).toHaveValue(/\[R1\]/, { timeout: 25_000 });
  expect(requests).toHaveLength(1); expect(JSON.stringify(requests[0])).toContain(sourceText);
  const reviewed = `${await prose.inputValue()}\n\nObservación personal revisada.`;
  await prose.fill(reviewed);
  await academic.getByRole("checkbox", { name: "He revisado este contenido y sus fuentes", exact: true }).check();
  await academic.getByRole("button", { name: "Guardar revisión", exact: true }).click();
  await expect(academic.getByRole("status")).toContainText("Revisión guardada");
  const artifact = await db.altazorAcademicArtifact.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  expect(artifact.status).toBe("reviewed"); expect(artifact.body).toBe(reviewed);
  const markdownDownload = page.waitForEvent("download"); await academic.getByRole("link", { name: "Markdown", exact: true }).click();
  const markdownPath = testInfo.outputPath("propuesta-academica-ficticia.md"); await (await markdownDownload).saveAs(markdownPath);
  expect(await readFile(markdownPath, "utf8")).toBe(reviewed);
  const wordDownload = page.waitForEvent("download"); await academic.getByRole("link", { name: "Word", exact: true }).click();
  const wordPath = testInfo.outputPath("propuesta-academica-ficticia.docx"); await (await wordDownload).saveAs(wordPath); assertPlainDocx(await readFile(wordPath));
  await academic.getByRole("button", { name: "Preparar para LinkedIn", exact: true }).click();
  await expect(academic.getByRole("status")).toContainText("Borrador privado preparado en Conexiones");
  const share = await db.externalShareDraft.findFirstOrThrow({ where: { ownerId } }); expect(JSON.parse(share.originJson)).toMatchObject({ kind: "academic", workspaceId: workspace.id, artifactId: artifact.id, revision: artifact.revision });
  await academic.getByRole("combobox", { name: /^Incorporar como escrito privado en/ }).selectOption(causaId);
  await academic.getByRole("button", { name: "Incorporar revisión a la causa", exact: true }).click();
  const writing = academic.getByRole("link", { name: "Abrir escrito incorporado", exact: true }); await expect(writing).toBeVisible();
  const draftId = new URL((await writing.getAttribute("href"))!, origin).searchParams.get("draft"); expect(draftId).toBeTruthy();
  const native = await page.request.get(`/api/causas/${causaId}/writings/${draftId}/export?format=markdown`); expect(native.status(), await native.text()).toBe(200);
  const nativeText = await native.text(); expect(nativeText).toContain("[^R1]"); expect(nativeText).toContain("[^R1]:"); expect(nativeText).not.toContain("fuentes incorporadas cuyo marcador no aparece");
  await page.reload(); await page.locator(".altazor-tabs").getByRole("button", { name: "Academia", exact: true }).click();
  await academic.getByRole("combobox", { name: /^Trabajo guardado/ }).selectOption(workspace.id);
  await academic.locator(".altazor-academic-results").getByRole("button").click(); await expect(prose).toHaveValue(reviewed);
  const current = await page.request.get(`/api/books/${book.id}`); expect(current.status()).toBe(200);
  const currentBook = (await current.json()).book;
  expect((await page.request.delete(`/api/books/${book.id}`, { headers: mutationHeaders, data: { revision: currentBook.revision } })).status()).toBe(200);
  expect([404, 409]).toContain((await page.request.get(`/api/altazor/academic/${workspace.id}/artifacts/${artifact.id}/export?format=md`)).status());
  expect(requests).toHaveLength(1); expect(blocked).toEqual([]);
});
