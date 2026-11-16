import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { sha256 } from "../src/lib/evidence/fragments";
import { loginAs, authenticateApiRequests } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const n = await networkGateway(String(info.project.use.baseURL)); try { await provide(n); } finally { await n.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
const key = "fictional-personal-offline-password";
async function fixture(page: Page) {
  const tag = randomUUID();
  const user = await prisma.user.create({ data: { name: "Autor ficticio", email: `${tag}@offline-personal.invalid`, password: await hash("lexopen", 10), role: "abogado" } });
  const workspace = await prisma.altazorAcademicWorkspace.create({ data: { ownerId: user.id, requestId: randomUUID(), title: "Proyecto ficticio", kind: "research" } });
  const body = "Manuscrito inicialmente revisado";
  const artifact = await prisma.altazorAcademicArtifact.create({ data: { workspaceId: workspace.id, requestId: randomUUID(), inputSha256: sha256(body), title: "Artículo personal", mode: "academic_writing", body, bodySha256: sha256(body), status: "reviewed" } });
  // No bytes or real book are needed for private annotations; this is a retained fixture.
  const book = await prisma.libraryBook.create({ data: { ownerId: user.id, requestId: randomUUID(), title: "Libro ficticio", sourceName: "fixture.txt", mimeType: "text/plain", storageKey: "fixture-does-not-read-bytes", extractedText: "BOOK_CONTENT_NOT_COPIED", sourceSha256: sha256(tag), textSha256: sha256("BOOK_CONTENT_NOT_COPIED"), status: "completed", locatorKind: "text-offset" } });
  await prisma.libraryBookFragment.create({ data: { bookId: book.id, ordinal: 1, text: "BOOK_CONTENT_NOT_COPIED", textSha256: sha256("BOOK_CONTENT_NOT_COPIED"), startOffset: 0, endOffset: 23, locatorLabel: "Fragmento 1" } });
  await loginAs(page, user.email); await authenticateApiRequests(page);
  return { user, artifact, book, cleanup: async () => { await prisma.commandExecution.deleteMany({ where: { ownerId: user.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: user.id } }); await prisma.user.delete({ where: { id: user.id } }); } };
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Áreas del espacio local" })).toBeVisible(); }
async function prepare(page: Page, kind: string, id: string, noun: string) {
  await page.goto(`/offline.html?kind=${kind}&record=${id}`); await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
  await page.getByRole("button", { name: `Preparar ${noun}`, exact: true }).click(); await expect(page.locator("#message")).toContainText("Registro preparado");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator("#record-new")).toBeHidden();
}
async function sync(page: Page) { const button = page.getByRole("button", { name: "Sincronizar registro", exact: true }); await button.click(); await expect(button).toBeEnabled({ timeout: 40000 }); }
test("manuscrito: recarga cifrada sin red, sincronización y revisión invalidada", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, "academic", f.artifact.id, "manuscrito"); network.setOffline(true);
    await page.getByLabel("Texto del manuscrito", { exact: true }).fill("Texto conservado sin conexión"); await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada");
    await page.reload(); await unlock(page); await expect(page.getByLabel("Texto del manuscrito", { exact: true })).toHaveValue("Texto conservado sin conexión");
    network.setOffline(false); network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.reload(); await unlock(page); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const artifact = await prisma.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: f.artifact.id } }); expect(artifact.body).toBe("Texto conservado sin conexión"); expect(artifact.status).toBe("proposed"); expect(artifact.revision).toBe(2);
    expect(await prisma.altazorAcademicArtifactVersion.count({ where: { artifactId: artifact.id } })).toBe(2);
    await sync(page); await expect(page.locator("#message")).toContainText("no tiene cambios");
  } finally { network.setOffline(false); await f.cleanup(); }
});
test("notas: marcador validado y conflicto conserva la edición local", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, "booknote", f.book.id, "nota de lectura");
    await page.getByLabel("Mis notas privadas", { exact: true }).fill("Nota privada pendiente"); await page.getByLabel("Tipo de marcador", { exact: true }).selectOption("fragment"); await page.getByLabel("Número de página o fragmento", { exact: true }).fill("1");
    await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const note = await prisma.libraryReadingNote.findUniqueOrThrow({ where: { ownerId_bookId: { ownerId: f.user.id, bookId: f.book.id } } }); expect(note.notes).toBe("Nota privada pendiente"); expect(note.bookmarkNumber).toBe("1");
    await page.getByLabel("Mis notas privadas", { exact: true }).fill("Edición local que debe conservarse");
    await prisma.libraryReadingNote.update({ where: { id: note.id }, data: { notes: "Cambio concurrente", revision: { increment: 1 } } });
    await sync(page); await expect(page.locator("#message")).toContainText("cambiaron");
    network.setOffline(true); await page.reload(); await unlock(page); await expect(page.getByLabel("Mis notas privadas", { exact: true })).toHaveValue("Edición local que debe conservarse");
    expect((await prisma.libraryReadingNote.findUniqueOrThrow({ where: { id: note.id } })).notes).toBe("Cambio concurrente");
    expect(await page.locator("body").textContent()).not.toContain("BOOK_CONTENT_NOT_COPIED");
  } finally { network.setOffline(false); await f.cleanup(); }
});
