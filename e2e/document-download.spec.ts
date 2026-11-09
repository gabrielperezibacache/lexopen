import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Las pruebas de descarga requieren almacenamiento local desechable");
const tag = randomUUID(), prefix = `download-fixture/${tag}`;
const original = Buffer.from("%PDF-1.7\n" + "fixture".repeat(30));
let causeId = "";
const ids: string[] = [];

test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
  causeId = (await db.causa.create({ data: { titulo: `Descargas ficticias ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id } })).id;
  await putObject({ key: `${prefix}/original.pdf`, body: original, contentType: "application/pdf" });
  for (const data of [
    { nombre: "sin-original.pdf", mimeType: "application/pdf", contenido: null, storageKey: null },
    { nombre: "contenido-invalido.pdf", mimeType: "application/pdf", contenido: "Texto extraído sin original", storageKey: null },
    { nombre: "original-perdido.pdf", mimeType: "application/pdf", contenido: "Texto extraído", storageKey: `${prefix}/missing.pdf` },
    { nombre: "original.pdf", mimeType: "application/pdf", contenido: null, storageKey: `${prefix}/original.pdf` },
    { nombre: "vacio.txt", mimeType: "text/plain", contenido: "", storageKey: null },
  ]) ids.push((await db.documento.create({ data: { ...data, causaId: causeId, autorId: owner.id } })).id);
});

test.afterAll(async () => {
  try {
    await db.documento.deleteMany({ where: { id: { in: ids } } });
    if (causeId) await db.causa.deleteMany({ where: { id: causeId } });
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
  const text = await page.request.get(`/api/documentos/${ids[4]}/content`);
  expect(text.status()).toBe(200);
  expect((await text.body()).length).toBe(0);
});
