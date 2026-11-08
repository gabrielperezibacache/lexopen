import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";

test("Mis Causas organiza manual, OJV y Drive en un expediente autorizado", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(12_000);
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const marker = randomUUID().slice(0, 8);
  const driveFolderId = `FixtureFolder_${marker}`;
  const title = "Prueba de pago · Demostración";
  let causaId = "";
  const documentIds: string[] = [];
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
    const causa = await db.causa.create({ data: {
      titulo: title, tribunal: "Órgano de demostración", materia: "civil", acceso: "equipo", abogadoId: owner.id,
      googleDriveFolderId: driveFolderId, googleDriveFolderName: "Drive de demostración",
    } });
    causaId = causa.id;
    for (const [name, origin] of [["Anexo manual.txt", "manual"], ["Resolución OJV.txt", "pjud"], ["Informe Drive.txt", "drive"]]) {
      const doc = await db.documento.create({ data: {
        nombre: name, causaId, autorId: owner.id, contenido: `Texto ficticio de ${name}.`, mimeType: "text/plain", extractionStatus: "completed",
      } });
      documentIds.push(doc.id);
      if (origin === "pjud") {
        const movement = await db.causaMovimiento.create({ data: { causaId, titulo: "Resolución de demostración", fecha: new Date(), fuente: "pjud", documentoRef: `doc:${doc.id}` } });
        await db.pjudDocumentJob.create({ data: { causaId, movimientoId: movement.id, documentoId: doc.id, sourceRefHash: marker, status: "saved" } });
      }
      if (origin === "drive") {
        await db.driveDocumentImport.create({ data: { causaId, documentoId: doc.id, folderId: driveFolderId, driveFileId: `FixtureFile_${marker}`, driveVersion: "1", exportMimeType: "", sourceSha256: marker } });
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark" });
    await loginAs(page, "socio@estudio.cl");
    await authenticateApiRequests(page);
    await page.getByTestId("desktop-sidebar").getByRole("link", { name: "Causas", exact: true }).click();
    await expect(page).toHaveURL(/\/mis-causas$/);
    await expect(page.getByRole("heading", { name: "Mis Causas", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    const lookup = page.getByRole("form", { name: "Búsqueda de causas", exact: true });
    const term = "PRUEBA DE PAGO";
    await lookup.getByRole("searchbox", { name: "Buscar causas", exact: true }).fill(term);
    await lookup.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get("q") === term);
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    const repeated = new URL(page.url());
    repeated.searchParams.append("q", "término sin coincidencias");
    await page.goto(repeated.toString());
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("link", { name: title, exact: true }).click();
    const archive = page.locator("#main-content").getByTestId("case-archive");
    await expect(archive.getByRole("heading", { name: "Carpetas y documentos" })).toBeVisible();
    await expect(archive.getByText("Descargado de OJV", { exact: true })).toBeVisible();
    await expect(archive.getByText("Importado de Drive", { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(`FixtureFile_${marker}`);
    await archive.getByText("Filtrar por origen", { exact: true }).click();
    await archive.getByRole("combobox", { name: "Origen", exact: true }).selectOption("lexopen");
    await archive.getByRole("button", { name: "Aplicar filtro", exact: true }).click();
    await expect(archive.getByRole("link", { name: "Anexo manual.txt", exact: true })).toBeVisible();
    await expect(archive.getByRole("link", { name: "Informe Drive.txt", exact: true })).toHaveCount(0);
    await archive.getByRole("link", { name: "Quitar filtros", exact: true }).click();
    await expect(archive.getByRole("link", { name: "Informe Drive.txt", exact: true })).toBeVisible();
    await archive.getByText("Nueva carpeta", { exact: true }).click();
    await archive.getByLabel("Nombre de la carpeta").fill("Prueba documental");
    await archive.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(archive.getByRole("link", { name: "Prueba documental", exact: true })).toBeVisible();
    for (const name of ["Anexo manual.txt", "Resolución OJV.txt", "Informe Drive.txt"]) {
      await archive.getByRole("checkbox", { name: `Seleccionar ${name}` }).check();
    }
    await archive.getByRole("combobox", { name: "Carpeta de destino", exact: true }).selectOption({ label: "Prueba documental" });
    await archive.getByRole("button", { name: "Mover seleccionados" }).click();
    await expect(archive.getByText("Documentos movidos.", { exact: true })).toBeVisible();
    await expect(archive.getByRole("link", { name: "Informe Drive.txt", exact: true })).toHaveCount(0);
    await archive.getByRole("link", { name: "Prueba documental", exact: true }).click();
    await expect(archive.getByRole("heading", { name: "Prueba documental", exact: true })).toBeVisible();
    await expect(archive.getByRole("link", { name: "Informe Drive.txt", exact: true })).toBeVisible();
    await expect(archive.getByRole("link", { name: "Consultar con Altazor", exact: true })).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("expediente-organizado-escritorio.png"), animations: "disabled" });

    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.screenshot({ path: testInfo.outputPath("expediente-organizado-movil.png"), animations: "disabled" });
    let driveWrites = 0;
    await page.route(`**/api/integrations/google/drive/${causaId}`, route => {
      if (route.request().method() !== "GET") {
        driveWrites++;
        return route.fulfill({ status: 500, json: { error: "Unexpected copy" } });
      }
      return route.fulfill({ json: {
        folderId: driveFolderId, nextPageToken: null, incompleteSearch: false,
        files: [{ id: `RemoteFixture_${marker}`, name: "Original remoto de demostración.pdf", mimeType: "application/pdf", version: "7", sizeBytes: 1234, importable: true }],
      } });
    });
    await archive.getByRole("link", { name: "Google Drive", exact: true }).click();
    await archive.getByText("Archivos de Google Drive", { exact: true }).click();
    await archive.getByRole("button", { name: "Elegir archivos de Drive", exact: true }).click();
    await expect(archive.getByRole("radio", { name: "Seleccionar Original remoto de demostración.pdf" })).toBeVisible();
    expect(driveWrites).toBe(0);
    await expect(archive.getByText("Carpeta de destino · Prueba documental")).toBeVisible();
    await archive.locator('input[type="file"]').first().setInputFiles({
      name: "Nuevo anexo.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Original de demostración subido a la carpeta."),
    });
    const upload = page.waitForResponse(response => response.url().endsWith("/api/documentos") && response.request().method() === "POST");
    await archive.getByRole("button", { name: "Incorporar 1", exact: true }).click();
    const created = await upload;
    expect(created.status()).toBe(201);
    documentIds.push((await created.json()).id);
    await expect(archive.getByRole("link", { name: "Nuevo anexo.txt", exact: true })).toBeVisible();
    const consultation = archive.getByRole("listitem").filter({ hasText: "Informe Drive.txt" }).getByRole("link", { name: "Consultar con Altazor", exact: true });
    await expect(consultation).toHaveAttribute("href", new RegExp(`documentoId=${documentIds[2]}`));
    await consultation.click();
    await expect(page).toHaveURL(/\/inicio/);
    await expect(page.getByRole("textbox", { name: "Mensaje para ALTAZOR" })).toHaveValue(/revisar este documento/);

    await loginAs(page, "abogado@estudio.cl");
    await authenticateApiRequests(page);
    const denied = await apiRequest(page).post(`/api/causas/${causaId}/expediente`, { data: { action: "create-folder", name: "Ajena", parentId: null } });
    expect(denied.status()).toBe(404);
  } finally {
    if (causaId) {
      await db.auditEvent.deleteMany({ where: { OR: [{ entityId: causaId }, { entityType: "CaseDocumentFolder", entityId: { in: (await db.caseDocumentFolder.findMany({ where: { causaId }, select: { id: true } })).map(folder => folder.id) } }] } });
      await db.documento.deleteMany({ where: { id: { in: documentIds } } });
      await db.causa.delete({ where: { id: causaId } });
    }
    await db.$disconnect();
  }
});
