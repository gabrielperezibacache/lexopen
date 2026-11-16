import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(() => db.$disconnect());
test("documents beyond 100 remain searchable, paginated and subject to current cause access", async ({ page }, info) => {
  test.setTimeout(90000);
  const tag = `history-${randomUUID()}`;
  const actor = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  const other = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
  const cause = await db.causa.create({ data: { titulo: tag, tribunal: "Fictitious", materia: "civil", acceso: "equipo", abogadoId: actor.id } });
  const hidden = await db.causa.create({ data: { titulo: tag + " private", tribunal: "Fictitious", materia: "civil", acceso: "equipo", abogadoId: other.id } });
  try {
    const at = new Date("2026-01-01T12:00:00Z");
    await db.documento.createMany({ data: Array.from({ length: 103 }, (_, i) => ({ id: `${tag}-${String(i).padStart(3,"0")}`, nombre: `${tag} document ${i}`, causaId: cause.id, autorId: actor.id, updatedAt: at })) });
    await db.documento.create({ data: { nombre: `${tag} hidden`, causaId: hidden.id, autorId: other.id } });
    await loginAs(page, actor.email);
    await page.goto(`/documentos?q=${tag}`);
    const rows = () => page.locator("tbody tr");
    await expect(rows()).toHaveCount(100);
    await expect(page.getByText(`${tag} hidden`, { exact: true })).toHaveCount(0);
    const first = await rows().locator("td:first-child > a:first-child").allTextContents();
    await page.getByRole("link", { name: "Ver siguientes", exact: true }).click();
    await expect(rows()).toHaveCount(3);
    const second = await rows().locator("td:first-child > a:first-child").allTextContents();
    expect(new Set([...first, ...second]).size).toBe(103);
    const after = page.url();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("documents-history-mobile.png"), fullPage: true });
    await db.causa.update({ where: { id: cause.id }, data: { abogadoId: other.id } });
    await page.goto(after);
    await expect(page.locator("tbody tr")).toHaveCount(0);
  } finally {
    await db.documento.deleteMany({ where: { causaId: { in: [cause.id, hidden.id] } } });
    await db.causa.deleteMany({ where: { id: { in: [cause.id, hidden.id] } } });
  }
});
test("audit filters search past the newest 300 events", async ({ page }) => {
  const tag = `audit-history-${randomUUID()}`;
  try {
    await db.auditEvent.create({ data: { action: tag, entityType: "Fictitious", afterJson: JSON.stringify({ text: "older-needle" }), createdAt: new Date("2020-01-01") } });
    await db.auditEvent.createMany({ data: Array.from({ length: 305 }, () => ({ action: tag, entityType: "Fictitious", afterJson: "{}" })) });
    await loginAs(page, "socio@estudio.cl");
    await page.goto(`/auditoria?action=${tag}&q=older-needle`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText(tag);
  } finally { await db.auditEvent.deleteMany({ where: { action: tag } }); }
});
test("message history retains an unsent draft across pages and includes all internal roles", async ({ page }) => {
  const tag = `message-history-${randomUUID()}`;
  const sender = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  const receiver = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
  try {
    await db.message.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ senderId: sender.id, receiverId: receiver.id, subject: `${tag}-${i}`, body: "Fictitious message", createdAt: new Date("2030-01-01T12:00:00Z") })) });
    await loginAs(page, sender.email); await page.goto("/mensajes");
    await page.getByRole("button", { name: "Nuevo mensaje", exact: true }).click();
    await page.locator('input[name="subject"]').fill(tag + " unsent");
    await expect(page.locator(`select[name="receiverId"] option[value="${receiver.id}"]`)).toHaveCount(1);
    await page.getByRole("link", { name: "Ver siguientes", exact: true }).click();
    await expect(page).toHaveURL(/after=/);
    await expect(page.locator('input[name="subject"]')).toHaveValue(tag + " unsent");
    await expect(page.getByText("Fictitious message").first()).toBeVisible();
  } finally { await db.message.deleteMany({ where: { subject: { startsWith: tag } } }); }
});
