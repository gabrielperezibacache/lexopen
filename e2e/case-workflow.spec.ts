import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Workflow browser fixtures require local storage");
const tag = randomUUID(), email = `workflow-${tag}@example.test`;
let ownerId = "", causaId = "", hiddenId = "", bookId = "", storageKey = "";
const title = "Preparación de una causa demostrativa con una denominación extensa para comprobar el recorrido entre herramientas";

test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { id: true, password: true } });
  ownerId = (await db.user.create({ data: { email, name: "Profesional de demostración del recorrido", role: "abogado", password: seed.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: title, tribunal: "Tribunal de demostración", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  hiddenId = (await db.causa.create({ data: { titulo: "DENOMINACIÓN RESERVADA AJENA", tribunal: "Tribunal de demostración", materia: "civil", acceso: "equipo", abogadoId: seed.id } })).id;
});

test.afterAll(async () => {
  try {
    if (causaId) await db.caseWritingDraft.deleteMany({ where: { causaId } });
    if (causaId) await db.hearingWorkspace.deleteMany({ where: { causaId } });
    await db.causa.deleteMany({ where: { id: { in: [causaId, hiddenId].filter(Boolean) } } });
    if (bookId) await db.libraryBook.deleteMany({ where: { id: bookId } });
    if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
    if (storageKey) await rm(path.join(process.env.STORAGE_PATH || "storage", storageKey), { force: true });
  } finally { await db.$disconnect(); }
});

test("recorrido de causa: biblioteca y lector conservan contexto, escrito recibe volumen y el muro ético protege la remisión", async ({ page }, info) => {
  test.setTimeout(120_000);
  await loginAs(page, email);
  const imported = await page.request.post("/api/books", { multipart: { requestId: randomUUID(), title: "Lectura de trabajo · demostración", author: "Material ficticio", preserveOriginal: "true", file: { name: "lectura-demo.txt", mimeType: "text/plain", buffer: Buffer.from("Material de demostración. La lectura del contrato exige distinguir el pasaje conservado de la observación del profesional. No es una obra jurídica publicada.") } } });
  expect(imported.status(), await imported.text()).toBe(201);
  bookId = (await imported.json()).book.id;
  storageKey = (await db.libraryBook.findUniqueOrThrow({ where: { id: bookId }, select: { storageKey: true } })).storageKey;
  await page.goto(`/causas/${causaId}`);
  const nav = page.getByRole("navigation", { name: "Recorrido de la causa", exact: true });
  await expect(nav.getByRole("link", { name: "Resumen", exact: true })).toHaveAttribute("aria-current", "location");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const destinations = nav.locator("ol > li > a");
  await expect(destinations).toHaveCount(5);
  for (const destination of await destinations.all()) {
    const bounds = await destination.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  }
  await expect(page.getByRole("button", { name: "Sync Obsidian", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function capture(surface: string, selector = "[data-testid=case-workflow]") {
    for (const [mode, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.locator(selector).evaluate(element => window.scrollTo({ top: Math.max(0, scrollY + element.getBoundingClientRect().top - 105), behavior: "instant" }));
      await page.mouse.move(0, 0);
      // Give the compositor two frames to repaint the 3D planes after resizing.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      // Finishing transitions for a resized 3D scene can omit a compositor plane.
      await page.screenshot({ path: info.outputPath(`workflow-${surface}-${mode}.png`), animations: surface === "library" ? "allow" : "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await capture("cause");
  await nav.getByRole("link", { name: "Biblioteca", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?causa=${causaId}$`));
  await expect(nav).toContainText(title);
  await expect(nav.getByRole("link", { name: "Biblioteca", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("library-book")).toHaveCount(1);
  await capture("library", ".book-library-composition");
  await page.getByTestId("library-book").getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/biblioteca/${bookId}\\?causa=${causaId}$`));
  const back = page.getByRole("link", { name: "Volver a mi biblioteca", exact: true });
  await expect(back).toHaveAttribute("href", `/biblioteca?causa=${causaId}`);
  await expect(page.getByRole("heading", { name: "Lectura de trabajo · demostración", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Elegir pasajes para el escrito de la causa", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/causas/${causaId}/escritos\\?fuentes=book&libro=${bookId}$`));
  await page.getByLabel("Nombre del nuevo escrito", { exact: true }).fill("Observaciones · demostración");
  await page.getByRole("button", { name: "Nuevo escrito", exact: true }).click();
  await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("combobox", { name: "Libro o sentencia", exact: true })).toHaveValue(bookId);
  await expect(page.getByTestId("writing-source-candidate")).toHaveCount(1);
  await page.getByRole("button", { name: "Incorporar al escrito", exact: true }).click();
  await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue(/Material de demostración/);
  await expect(page.locator(".writing-status")).toContainText("Guardado");
  await capture("writing", ".writing-paper");
  const draftId = new URL(page.url()).searchParams.get("draft");
  expect(draftId).toBeTruthy();
  const newer = await page.request.post(`/api/causas/${causaId}/writings`, { data: { requestId: randomUUID(), title: "Otro escrito posterior", body: "Este escrito no debe sustituir el retorno al original." } });
  expect(newer.status(), await newer.text()).toBe(201);
  await expect(nav.getByRole("link", { name: "Biblioteca", exact: true })).toHaveAttribute("href", `/biblioteca?causa=${causaId}&escrito=${draftId}`);
  await nav.getByRole("link", { name: "Biblioteca", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?causa=${causaId}&escrito=${draftId}$`));
  await page.getByTestId("library-book").getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/biblioteca/${bookId}\\?causa=${causaId}&escrito=${draftId}$`));
  await page.getByRole("link", { name: "Elegir pasajes para el escrito de la causa", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("draft")).toBe(draftId);
  await expect(page.getByLabel("Título del escrito", { exact: true })).toHaveValue("Observaciones · demostración");
  await nav.getByRole("link", { name: "Audiencias", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/causas/${causaId}/audiencias\\?escrito=${draftId}$`));
  await expect(nav.getByRole("link", { name: "Audiencias", exact: true })).toHaveAttribute("aria-current", "page");
  await capture("hearing");
  await nav.getByRole("link", { name: "Escritos", exact: true }).click();
  await expect(page.getByLabel("Texto del escrito", { exact: true })).toHaveValue(/Material de demostración/);
  expect((await page.request.get(`/api/causas/${hiddenId}`)).status()).toBe(404);
  for (const route of [`/biblioteca?causa=${hiddenId}`, `/biblioteca/${bookId}?causa=${hiddenId}`]) {
    // App Router may have sent the shell before the server resolves notFound().
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("DENOMINACIÓN RESERVADA AJENA");
    await expect(page.getByTestId("case-workflow")).toHaveCount(0);
  }
});
