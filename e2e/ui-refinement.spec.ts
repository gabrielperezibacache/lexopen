import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(async () => { await db.$disconnect(); });

async function openAndDismiss(page: Page, label: string, info: TestInfo, image: string) {
  const trigger = page.getByRole("button", { name: label, exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath(image), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
}

test("diálogos de trabajo: foco, Escape, móvil y movimiento reducido", async ({ page }, info) => {
  await loginAs(page, "socio@estudio.cl");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
  await expect(dialog).toHaveCSS("animation-name", "folio-open");
  await expect(dialog.getByLabel("Razón social / nombre", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Nuevo cliente", exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  await expect(dialog).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await page.goto("/personas");
  await openAndDismiss(page, "Crear usuario", info, "personas-dialog-mobile.png");
  const site = await db.site.findFirstOrThrow();
  await page.goto(`/sites/${site.id}/wiki`);
  await openAndDismiss(page, "Nueva página", info, "wiki-dialog-mobile.png");
  const invoices = await db.invoice.findMany({ where: { status: { in: ["emitida", "parcial", "vencida"] } } });
  const invoice = invoices.find(row => row.totalClp > row.paidClp);
  expect(invoice, "Factura ficticia con saldo para revisar el formulario sin registrar pagos").toBeTruthy();
  await page.goto(`/facturacion/facturas/${invoice!.id}`);
  await openAndDismiss(page, "Registrar pago", info, "payment-dialog-mobile.png");
});

test("tablas móviles conservan los registros y la navegación activa queda a la vista", async ({ page }, info) => {
  await loginAs(page, "socio@estudio.cl");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/causas");
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await table.scrollIntoViewIfNeeded();
  await expect(table.getByRole("columnheader", { name: "Causa", exact: true })).toHaveCount(1);
  await expect(table.getByRole("cell").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("case-records-mobile.png"), fullPage: false });
  const site = await db.site.findFirstOrThrow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/sites/${site.id}/personas`);
  await page.setViewportSize({ width: 360, height: 900 });
  const active = page.locator('a[aria-current="page"][href$="/personas"]');
  await expect.poll(async () => active.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })).toBeTruthy();
});
