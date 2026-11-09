import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID(); let dueId = "", doneId = "", restrictedId = "";
const restrictedEmail = `jornada-${tag}@example.test`;
test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" } });
  restrictedId = (await db.user.create({ data: { email: restrictedEmail, name: "Jornada sin asistente", password: owner.password, role: "abogado", capabilityRevokes: "assistant.use" } })).id;
  const old = new Date(); old.setUTCMonth(old.getUTCMonth() - 3);
  dueId = (await db.plazo.create({ data: { titulo: `Vencido accesible ${tag}`, tipo: "judicial", fechaLimite: old, responsableId: owner.id, estado: "pendiente" } })).id;
  doneId = (await db.plazo.create({ data: { titulo: `Cumplido no pendiente ${tag}`, tipo: "judicial", fechaLimite: old, responsableId: owner.id, estado: "cumplido" } })).id;
});
test.afterAll(async () => { await db.plazo.deleteMany({ where: { id: { in: [dueId, doneId].filter(Boolean) } } }); await db.auditEvent.deleteMany({ where: { actorId: restrictedId || "__none__" } }); await db.user.deleteMany({ where: { id: restrictedId || "__none__" } }); await db.$disconnect(); });
test("jornada: vencidos de otros meses, navegación por términos y adaptación móvil", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await loginAs(page, "abogado@estudio.cl");
  const summary = page.getByTestId("day-overview");
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link", { name: /Vencidos pendientes/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("jornada-desktop.png"), fullPage: false });
  await summary.getByRole("link", { name: /Vencidos pendientes/ }).click();
  await expect(page).toHaveURL(/\/plazos\?vista=mis-vencidos$/, { timeout: 30_000 });
  await expect(page.getByText(`Vencido accesible ${tag}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Cumplido no pendiente ${tag}`, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Ir a un apartado", exact: true });
  await dialog.getByRole("textbox", { name: "Ir a un apartado", exact: true }).fill("Drive organizar");
  await expect(dialog.getByRole("button", { name: /Mis Causas/i })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Ir a un apartado", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/mis-causas$/, { timeout: 30_000 });
  await page.goto("/inicio");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("jornada-mobile.png"), fullPage: false });
});

test("jornada disponible sin permiso de asistente", async ({ page }) => {
  await loginAs(page, restrictedEmail);
  await expect(page.getByRole("heading", { name: "Tu jornada", exact: true })).toBeVisible();
  await expect(page.getByTestId("inicio-composer")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir Mis Causas/ })).toBeVisible();
});

test("buscar ajustes conserva los formularios sin guardar", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion");
  const draft = page.locator('#estudio input[name="name"]').first();
  await expect(draft).toBeVisible({ timeout: 20_000 });
  await draft.fill("Borrador de estudio sin guardar");
  const nav = page.getByRole("navigation", { name: "Secciones de configuración", exact: true });
  await nav.getByRole("searchbox", { name: "Buscar un ajuste", exact: true }).fill("Drive");
  await nav.getByRole("link", { name: /Google del estudio/ }).click();
  await expect(page).toHaveURL(/#google-settings$/);
  await expect(nav.getByRole("searchbox", { name: "Buscar un ajuste", exact: true })).toHaveValue("");
  await expect(draft).toHaveValue("Borrador de estudio sin guardar");
});
