/** Browser layout/controls use explicitly simulated execution events, never claim Docker validation. */
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { putObject } from "../src/lib/storage";
import { storeEvidenceSnapshot } from "../src/lib/evidence/service";
import { sha256 } from "../src/lib/evidence/fragments";
import type { WorkbenchRunView } from "../src/lib/workbench/service";
import { loginAs } from "./helpers";
const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== url || [process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Use the disposable local fixture environment");
const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), email = `workbench-${tag}@example.test`, prefix = `workbench-browser/${tag}`;
let ownerId = "", causaId = "";
const quote = "El comprobante ficticio registra un pago de cien pesos. No contiene personas ni antecedentes reales.";
test.beforeAll(async () => {
  ownerId = (await db.user.create({ data: { email, name: "Profesional ficticio de la Mesa", password: await hash("lexopen", 10), role: "abogado" } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Causa ficticia de la Mesa", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  const storageKey = `${prefix}/comprobante.txt`, bytes = Buffer.from(quote); await putObject({ key: storageKey, body: bytes, contentType: "text/plain" });
  const document = await db.documento.create({ data: { nombre: "Comprobante ficticio.txt", tipo: "evidencia", causaId, autorId: ownerId, mimeType: "text/plain", storageKey, contenido: quote, extractedMarkdown: quote, extractionStatus: "completed" } });
  await db.$transaction(tx => storeEvidenceSnapshot(tx, { documentoId: document.id, name: document.nombre, bytes, text: quote, storageKey, status: "completed" }));
});
test.afterAll(async () => {
  try {
    if (causaId) { await db.workbenchRun.deleteMany({ where: { causaId } }); await db.documento.deleteMany({ where: { causaId } }); await db.causa.deleteMany({ where: { id: causaId } }); }
    if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
    if (!process.env.STORAGE_PATH) throw Error("Refusing cleanup without explicit fictitious storage");
    await rm(path.join(process.env.STORAGE_PATH, prefix), { recursive: true, force: true });
  } finally { await db.$disconnect(); }
});
test("Mesa: preflight real desactivado y permisos de la causa", async ({ page }) => {
  await loginAs(page, email); await page.goto(`/causas/${causaId}/mesa`);
  await expect(page.getByRole("heading", { name: "Mesa del asistente", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparar el ejecutor local", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preparar trabajo", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Ver la guía de preparación" })).toHaveAttribute("href", "/ayuda/mesa-asistente");
});
test("Mesa: recorrido visual con proveedor y eventos ficticios, escritorio y móvil", async ({ page }, info) => {
  await loginAs(page, email);
  const base = `/api/causas/${causaId}/workbench`, fragmentId = "fixture-fragment", versionId = "fixture-version", runId = "fixture-run", createdAt = "2026-11-04T12:00:00.000Z";
  const local = { mode: "source_packet", provider: "local_recipe", model: "none", endpoint: "Contenedor local sin red", endpointHash: sha256("none"), remote: false, permitted: true, key: sha256("fixture-local") };
  let run: WorkbenchRunView | undefined;
  await page.route(`**${base}**`, async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    let body: unknown;
    if (pathname.endsWith("/capabilities")) body = { runtime: { available: true, reason: "UI fixture only" }, destinations: { source_packet: local, assisted_draft: { ...local, mode: "assisted_draft", provider: "fixture_remote", model: "fixture-model", endpoint: "Proveedor ficticio", remote: true, key: sha256("fixture-remote") } }, canWrite: true, setupHref: "/ayuda/mesa-asistente" };
    else if (pathname.endsWith("/sources")) body = { sources: [{ fragmentId, versionId, quote, title: "Comprobante ficticio", sourceSha256: sha256(quote), pageNumber: null, createdAt, href: "/documentos/ficticio/fuentes", partial: false }], nextAfter: null, coverage: "Pasaje ficticio para verificar la interfaz. No es un expediente real." };
    else if (pathname === base && request.method() === "POST") {
      run = { id: runId, objective: request.postDataJSON().objective, status: "queued", body: "", createdAt, destination: local as WorkbenchRunView["destination"], sources: [{ marker: "R1", title: "Comprobante ficticio", text: quote, href: "/documentos/ficticio/fuentes", versionId, sourceSha256: sha256(quote), warnings: [] }], events: [{ id: "fixture-event", kind: "queued", message: "Trabajo ficticio preparado para la prueba de interfaz.", createdAt }], artifacts: [], draftId: null }; body = { run, reused: false };
    } else if (pathname === base) body = { runs: run ? [{ id: run.id, available: true, objective: run.objective, status: run.status, createdAt }] : [], limited: false };
    else if (request.method() === "POST" && run) {
      if (request.postDataJSON().action === "execute") { run = { ...run, status: "awaiting_review", body: "Propuesta ficticia para revisión profesional.\n\nEs necesario cotejar el comprobante. [^R1]", artifacts: [{ id: "fixture-md", name: "borrador.md", mimeType: "text/markdown", size: 200, sha256: sha256("fixture") }, { id: "fixture-docx", name: "borrador.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 500, sha256: sha256("fixture-docx") }], events: [...run.events, { id: "fixture-complete", kind: "awaiting_review", message: "Eventos simulados: archivos listos para comprobar los controles.", createdAt }] }; body = run; }
      else { run = { ...run, status: "imported", draftId: "fixture-writing" }; body = { draftId: run.draftId, reused: false }; }
    } else body = run;
    await route.fulfill({ status: pathname === base && request.method() === "POST" ? 201 : 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`/causas/${causaId}/mesa`);
  await page.getByLabel("Objetivo del trabajo").fill("Preparar una propuesta ficticia sobre el comprobante de pago");
  await page.getByRole("checkbox", { name: /Comprobante ficticio/ }).check();
  await page.getByLabel("Tipo de trabajo").selectOption("assisted_draft");
  const consent = page.getByRole("checkbox", { name: /Permito enviar este objetivo/ });
  await consent.check(); await expect(page.getByRole("button", { name: "Preparar trabajo", exact: true })).toBeEnabled();
  await page.getByLabel("Objetivo del trabajo").fill("Preparar una propuesta ficticia actualizada sobre el comprobante de pago");
  await expect(consent).not.toBeChecked();
  await consent.check(); await page.getByRole("checkbox", { name: /Comprobante ficticio/ }).uncheck(); await expect(consent).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Comprobante ficticio/ }).check(); await page.getByLabel("Tipo de trabajo").selectOption("source_packet");
  await page.getByRole("button", { name: "Preparar trabajo", exact: true }).click();
  await page.getByLabel("Tipo de trabajo").selectOption("assisted_draft");
  await expect(page.locator(".workbench-result")).toContainText("Destino guardado: Cuaderno local sin IA");
  await expect(page.getByText("Pasajes y versiones guardados para este trabajo", { exact: true })).toBeVisible();
  await page.getByLabel("Tipo de trabajo").selectOption("source_packet");
  await page.getByRole("button", { name: "Ejecutar trabajo", exact: true }).click();
  await expect(page.getByLabel("Vista previa del borrador")).toContainText("Propuesta ficticia");
  await expect(page.getByRole("link", { name: "Descargar DOCX", exact: true })).toHaveAttribute("href", `${base}/${runId}/artifacts/fixture-docx`);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: info.outputPath("workbench-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Revisado: incorporar al escrito", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("workbench-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Revisado: incorporar al escrito", exact: true }).click();
  await expect(page.getByRole("link", { name: "Abrir escrito incorporado" })).toHaveAttribute("href", `/causas/${causaId}/escritos?draft=fixture-writing`);
});
