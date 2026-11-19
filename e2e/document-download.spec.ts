import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Las pruebas de descarga requieren almacenamiento local desechable");
const tag = randomUUID(), prefix = `download-fixture/${tag}`;
const damagedOriginal = Buffer.from("Original ficticio con formato incorrecto");
let original: Buffer;
let docx: Buffer;
let causeId = "";
let clientId = "";
const ids: string[] = [];

test.beforeAll(async () => {
  original = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
  const owner = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
  clientId = (await db.cliente.create({ data: { razonSocial: `Descargas ${tag}`, abogadoId: owner.id } })).id;
  causeId = (await db.causa.create({ data: { titulo: `Descargas ficticias ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, clienteId: clientId } })).id;
  docx = await readFile(path.join(process.cwd(), "src/lib/books/fixtures/juridical-fixture.docx"));
  const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  await putObject({ key: `${prefix}/original.docx`, body: docx, contentType: docxMime });
  await putObject({ key: `${prefix}/original.pdf`, body: original, contentType: "application/pdf" });
  await putObject({ key: `${prefix}/damaged.pdf`, body: damagedOriginal, contentType: "application/pdf" });
  for (const data of [
    { nombre: "sin-original.pdf", mimeType: "application/pdf", contenido: null, storageKey: null },
    { nombre: "contenido-invalido.pdf", mimeType: "application/pdf", contenido: "Texto extraído sin original", storageKey: null },
    { nombre: "original-perdido.pdf", mimeType: "application/pdf", contenido: "Texto extraído", storageKey: `${prefix}/missing.pdf` },
    { nombre: "original.pdf", mimeType: "application/pdf", contenido: null, storageKey: `${prefix}/original.pdf` },
    { nombre: "damaged.pdf", mimeType: "application/pdf", contenido: null, storageKey: `${prefix}/damaged.pdf` },
    { nombre: "vacio.txt", mimeType: "text/plain", contenido: "", storageKey: null },
    { nombre: "redacción.docx", mimeType: docxMime, contenido: "Extracto anterior", storageKey: `${prefix}/original.docx`, extractedMarkdown: "# Texto preparado" },
    { nombre: "legado.docx", mimeType: docxMime, contenido: "Texto de archivo antiguo", storageKey: null },
  ]) ids.push((await db.documento.create({ data: { ...data, causaId: causeId, autorId: owner.id } })).id);
});

test.afterAll(async () => {
  try {
    await db.documento.deleteMany({ where: { id: { in: ids } } });
    if (causeId) await db.causa.deleteMany({ where: { id: causeId } });
    if (clientId) await db.cliente.deleteMany({ where: { id: clientId } });
    await rm(path.join(path.resolve(process.env.STORAGE_PATH || "storage"), prefix), { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});

test("la descarga exige un original disponible y conserva sus bytes", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  for (const id of ids.slice(0, 3)) {
    const response = await page.request.get(`/api/documentos/${id}/content`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBe("Contenido no encontrado");
  }
  const pdf = await page.request.get(`/api/documentos/${ids[3]}/content`);
  expect(pdf.status()).toBe(200);
  expect(await pdf.body()).toEqual(original);
  const damaged = await page.request.get(`/api/documentos/${ids[4]}/content`);
  expect(damaged.status()).toBe(200);
  expect(await damaged.body()).toEqual(damagedOriginal);
  const text = await page.request.get(`/api/documentos/${ids[5]}/content`);
  expect(text.status()).toBe(200);
  expect((await text.body()).length).toBe(0);
  expect((await page.request.get(`/api/documentos/${ids[7]}/content`)).status()).toBe(404);
});

async function expectDownload(page: Page, link: Locator, name: string, bytes: Buffer) {
  const [file] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(file.suggestedFilename()).toBe(name);
  expect(await readFile((await file.path())!)).toEqual(bytes);
}

test("Documentos, causa y cliente descargan archivos y texto con su nombre y bytes", async ({ page }) => {
  test.setTimeout(120000);
  await loginAs(page, "socio@estudio.cl");
  for (const url of [`/documentos?q=${tag}`, `/causas/${causeId}#documentos`, `/clientes/${clientId}`]) {
    await page.goto(url);
    const link = (index: number, tail: string) => page.locator(`a[href="/api/documentos/${ids[index]}/${tail}"]`);
    await expect(link(0, "content?download=1")).toHaveCount(0);
    await expect(link(7, "content?download=1")).toHaveCount(0);
    await expectDownload(page, link(3, "content?download=1"), "original.pdf", original);
    await expectDownload(page, link(5, "content?download=1"), "vacio.txt", Buffer.alloc(0));
    await expectDownload(page, link(6, "content?download=1"), "redacción.docx", docx);
    await expectDownload(page, link(6, "markdown?download=1"), "redacción.docx.md", Buffer.from("# Texto preparado"));
    await expectDownload(page, link(7, "content?format=text"), "legado.docx.txt", Buffer.from("Texto de archivo antiguo"));
  }
});
