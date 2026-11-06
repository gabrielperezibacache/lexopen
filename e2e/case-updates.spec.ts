import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { parseMimeBuffer } from "../src/lib/mail/mime";
import { loginAs } from "./helpers";

const execFixture = promisify(execFile);

test("Novedades reúne los cuatro orígenes de una resolución y conserva una revisión distinta", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  if (new URL(process.env.DATABASE_URL!).toString() !== url || !path.isAbsolute(process.env.STORAGE_PATH || "") ||
      [process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) {
    throw new Error("Use only the disposable database and local test storage");
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const marker = randomUUID();
  const rit = "C-88001-2099";
  const title = "Novedades de la causa ficticia";
  const filename = "Resolución ficticia de prueba.pdf";
  let caseId = "";
  let mailId = "";
  let noticeId = "";
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
    const other = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
    const matter = await db.causa.create({ data: {
      titulo: title, rit, tribunal: "1º Juzgado Civil de Santiago", materia: "civil", acceso: "equipo", abogadoId: owner.id,
    } });
    caseId = matter.id;
    const fixture = await readFile(path.join(process.cwd(), "src/lib/mail/fixtures/pjud-notice.eml"));
    const parsed = await parseMimeBuffer(fixture);
    const attachment = parsed.attachments[0]!;
    const archiveHref = `/causas/${caseId}/expediente`;
    const newsHref = `${archiveHref}?vista=novedades`;

    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAs(page, "socio@estudio.cl");
    await page.goto("/mis-causas");
    await page.getByRole("link", { name: `Novedades de ${title}`, exact: true }).click();
    const news = page.getByRole("region", { name: "Últimos ingresos", exact: true });
    await expect(news.getByText(/Todavía no hay ingresos/)).toBeVisible();
    await news.getByRole("link", { name: "Añadir archivos", exact: true }).click();
    const uploader = page.locator("#incorporar-documentos");
    await uploader.locator('input[type="file"]').first().setInputFiles({
      name: filename, mimeType: "application/pdf", buffer: attachment.content,
    });
    const upload = page.waitForResponse(response => response.url().endsWith("/api/documentos") && response.request().method() === "POST");
    await uploader.getByRole("button", { name: "Incorporar 1", exact: true }).click();
    const created = await upload;
    expect(created.status()).toBe(201);
    const { id: documentId } = await created.json() as { id: string };
    const account = await db.mailboxAccount.upsert({ where: { userId: owner.id }, create: { userId: owner.id }, update: {} });
    const storageKey = `correo/inbox/fixture-${marker}/resolucion.pdf`;
    const storagePath = path.join(process.env.STORAGE_PATH!, storageKey);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, attachment.content);
    const messageData = {
      userId: owner.id, accountId: account.id, subject: parsed.subject, fromAddress: parsed.fromAddress,
      receivedAt: new Date(), bodyText: parsed.bodyText,
    };
    const message = await db.mailboxMessage.create({ data: {
      ...messageData, externalId: `novedades-${marker}`, attachments: { create: {
        filename: attachment.filename, mimeType: attachment.mimeType, storageKey, sizeBytes: attachment.content.length,
        sha256: createHash("sha256").update(attachment.content).digest("hex"),
      } },
    } });
    mailId = message.id;
    const apply = (id: string) => page.request.post(`/api/mail/messages/${id}`, { data: { action: "apply", causaId: caseId } });
    const applied = await apply(mailId);
    expect(applied.status(), await applied.text()).toBe(200);
    expect((await apply(mailId)).status()).toBe(200);
    expect(await db.documento.count({ where: { causaId: caseId } })).toBe(1);
    expect(await db.caseDocumentIntake.count({ where: { causaId: caseId } })).toBe(2);
    expect((await db.mailboxAttachment.findFirstOrThrow({ where: { messageId: mailId } })).documentoId).toBe(documentId);

    await page.goto(newsHref);
    const row = news.locator(":scope > ol > li");
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link", { name: filename, exact: true })).toHaveAttribute("href", `/documentos/${documentId}/fuentes`);
    await expect(row.getByText("Carga manual", { exact: true }).first()).toBeVisible();
    await expect(row.getByText("Correo", { exact: true }).first()).toBeVisible();
    await row.locator("summary:visible").click();
    await expect(row.getByRole("link", { name: "Abrir correo", exact: true })).toHaveAttribute("href", `/correo?id=${mailId}`);
    const original = await page.request.get(`/api/documentos/${documentId}/content`);
    expect(original.status()).toBe(200);
    expect(await original.body()).toEqual(attachment.content);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("link", { name: "Descargar original", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(filename);

    const notice = await db.mailboxMessage.create({ data: {
      ...messageData, subject: `Audiencia ${rit}`, externalId: `novedades-aviso-${marker}`,
      bodyText: "Tribunal: 1º Juzgado Civil de Santiago\nAudiencia el 2099-12-15",
    } });
    noticeId = notice.id;
    expect((await apply(noticeId)).status()).toBe(200);
    // Provider inputs are synthetic. Drive and OJV use the actual server persistence functions.
    const { stdout } = await execFixture(process.execPath, [
      "--import", "tsx", "e2e/fixtures/case-updates-provider-imports.ts", caseId, documentId,
    ], { timeout: 40_000, env: { ...process.env, NODE_ENV: "test" } });
    const revision = JSON.parse(stdout.trim().split("\n").at(-1)!) as { documentoId: string };
    expect(revision.documentoId).not.toBe(documentId);
    expect(await db.caseDocumentIntake.count({ where: { causaId: caseId, documentoId: documentId } })).toBe(4);

    await page.reload();
    await expect(row).toHaveCount(3);
    const shared = row.filter({ has: page.getByRole("link", { name: filename, exact: true }) });
    await expect(shared).toHaveCount(1);
    for (const label of ["Carga manual", "Correo", "Google Drive", "OJV"]) {
      await expect(shared.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const revised = news.getByRole("link", { name: "Resolución Drive revisión 8.pdf", exact: true });
    await expect(revised).toHaveAttribute("href", `/documentos/${revision.documentoId}/fuentes`);
    expect(await news.innerHTML()).not.toContain("ticket=ejemplo");
    await expect(news.getByRole("link", { name: "Correo incorporado", exact: true })).toHaveAttribute("href", `/correo?id=${noticeId}`);
    await shared.locator("summary:visible").click();
    await page.screenshot({ path: testInfo.outputPath("novedades-escritorio.png"), animations: "disabled" });

    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(shared.getByRole("link", { name: "Descargar original", exact: true })).toBeVisible();
    await expect(revised).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("novedades-movil.png"), animations: "disabled" });

    await loginAs(page, "abogado@estudio.cl");
    await page.goto(newsHref);
    await expect(page.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
    expect((await page.request.get(`/api/documentos/${documentId}/content`)).status()).toBe(404);
    expect((await page.request.get(`/api/documentos/${revision.documentoId}/content`)).status()).toBe(404);
    const membership = await db.causaMiembro.create({ data: { causaId: caseId, userId: other.id, rol: "lectura", desde: new Date(0) } });
    await page.goto(newsHref);
    await expect(row).toHaveCount(2);
    await expect(shared.getByText("Google Drive", { exact: true }).first()).toBeVisible();
    await expect(shared.getByText("OJV", { exact: true }).first()).toBeVisible();
    await expect(news.getByRole("link", { name: "Correo incorporado", exact: true })).toHaveCount(0);
    await shared.locator("summary:visible").click();
    await expect(news.getByRole("link", { name: "Abrir correo", exact: true })).toHaveCount(0);
    await db.causaMiembro.delete({ where: { id: membership.id } });
    await page.goto(newsHref);
    await expect(page.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
  } finally {
    if (mailId || noticeId) await db.mailboxMessage.deleteMany({ where: { id: { in: [mailId, noticeId].filter(Boolean) } } });
    if (caseId) {
      await db.documento.deleteMany({ where: { causaId: caseId } });
      await db.causa.deleteMany({ where: { id: caseId } });
    }
    await db.$disconnect();
  }
});
