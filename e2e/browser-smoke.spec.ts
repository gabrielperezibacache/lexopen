import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("formularios accesibles y menú móvil en el motor del navegador", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/clientes", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
  await expect(dialog.getByRole("textbox", { name: "Razón social / nombre", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo cliente", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", { name: "Abrir menú", exact: true });
  await open.click();
  await expect(page.getByRole("dialog", { name: "Menú", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/inicio", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Archivos para adjuntar al mensaje de ALTAZOR", { exact: true })).toHaveAttribute("type", "file");
});
