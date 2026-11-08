import { expect, test } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable browser database required");
test("revisión por versión, Word aprobado con recibo y edición que invalida la aprobación", async ({ page }, info) => {
  test.setTimeout(120_000);
  const tag = randomUUID(); let userId = "", causeId = "";
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@review-browser.invalid`, name: "Revisor ficticio", role: "abogado", password: await hash("lexopen", 10) } }); userId = user.id;
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: userId } }); causeId = cause.id;
    await loginAs(page, user.email); await authenticateApiRequests(page);
    const base = `/api/causas/${causeId}/writings`;
    const created = await apiRequest(page).post(base, { data: { requestId: randomUUID(), title: "Escrito ficticio para revisar", body: "Texto de autor ficticio para cotejo." } }); expect(created.status()).toBe(201);
    const { draft } = await created.json();
    await page.goto(`/causas/${causeId}/escritos?draft=${draft.id}`);
    const openExport = async () => {
      const more = page.locator(".writing-toolstrip details");
      if (!await more.evaluate(node => (node as HTMLDetailsElement).open)) await more.locator("summary").click();
      await more.getByRole("button", { name: "Exportar", exact: true }).click();
    };
    await openExport();
    const panel = page.locator("dialog.context-panel");
    await expect(panel.getByRole("button", { name: "Descargar versión aprobada", exact: true })).toBeDisabled();
    await panel.getByRole("checkbox", { name: "He revisado el texto y cotejado sus citas con los respaldos incorporados", exact: true }).check();
    await panel.getByRole("textbox", { name: "Observaciones de revisión", exact: true }).fill("Revisión enteramente ficticia.");
    for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: info.outputPath(`writing-review-${viewport.width}.png`), animations: "disabled" });
    }
    await panel.getByRole("button", { name: "Aprobar esta versión", exact: true }).click();
    await expect(panel).not.toBeVisible();
    await openExport();
    await expect(panel.getByText(/Versión aprobada · Revisor ficticio/)).toBeVisible();
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Descargar versión aprobada", exact: true }).click();
    const file = await download, bytes = await readFile((await file.path())!);
    const receipt = await prisma.caseWritingExport.findFirstOrThrow({ where: { draftId: draft.id, purpose: "approved" }, orderBy: { createdAt: "desc" } });
    expect(receipt.contentSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(receipt.reviewId).toBeTruthy();
    await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("textbox", { name: "Texto del escrito", exact: true }).fill("Texto editado después de aprobar.");
    await expect(page.locator(".writing-status")).toHaveText("Guardado", { timeout: 15_000 });
    await openExport();
    await expect(panel.getByText(/Revisión anterior sin vigencia/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Descargar versión aprobada", exact: true })).toBeDisabled();
    expect((await page.request.get(`${base}/${draft.id}/export?format=docx&purpose=approved`)).status()).toBe(409);
    expect(await prisma.caseWritingReview.count({ where: { draftId: draft.id } })).toBe(1);
    expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: draft.id } })).revision).toBeGreaterThan(1);
  } finally {
    if (causeId) { await prisma.caseWritingDraft.deleteMany({ where: { causaId: causeId } }); await prisma.causa.deleteMany({ where: { id: causeId } }); }
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect();
  }
});
