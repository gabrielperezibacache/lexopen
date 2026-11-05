import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("ocho áreas, secundario contextual y navegación rápida comparten destinos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, "socio@estudio.cl");
  const sidebar = page.getByTestId("desktop-sidebar");
  const main = sidebar.getByTestId("primary-navigation");
  await expect(main.locator("a")).toHaveCount(8);
  await expect(sidebar.getByRole("link", { name: "Iniciar sesión", exact: true })).toHaveCount(0);
  await main.getByRole("link", { name: "Agenda", exact: true }).click();
  const secondary = sidebar.getByTestId("secondary-navigation");
  await expect(secondary.getByRole("link", { name: "Plazos", exact: true })).toBeVisible();
  await expect(secondary.getByRole("link", { name: "Panel de audiencias", exact: true })).toBeVisible();
  await expect(secondary.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ir a un apartado", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ir a un apartado", exact: true });
  await dialog.getByRole("textbox", { name: "Ir a un apartado", exact: true }).fill("biblioteca");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("button", { name: /Mis libros y sentencias/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/biblioteca$/);
  await main.getByRole("link", { name: "Causas", exact: true }).click();
  await expect(sidebar.getByTestId("secondary-navigation").getByRole("link", { name: "Sincronización", exact: true })).toBeVisible();
  await expect(sidebar.getByTestId("secondary-navigation").getByRole("link", { name: "Mis causas · ClaveÚnica", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("causas-section-tabs").getByRole("link", { name: "ClaveÚnica", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Miga de pan", exact: true })).toContainText("Expedientes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("móvil conserva las ocho áreas y ofrece búsqueda sin abrir el menú", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(page, "abogado@estudio.cl");
  await expect(page.getByRole("link", { name: "Búsqueda global", exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Abrir menú", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Menú", exact: true });
  await expect(drawer.getByTestId("primary-navigation").locator("a")).toHaveCount(8);
  expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("link", { name: "Búsqueda global", exact: true }).click();
  await expect(page).toHaveURL(/\/buscar$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("portal y paleta de cliente no ofrecen destinos internos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, "cliente@andes.cl");
  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar.getByRole("link", { name: "Causas", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Académico", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Conversar con ALTAZOR", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ir a un apartado", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ir a un apartado", exact: true });
  await expect(dialog.getByRole("button", { name: /Configuración|Honorarios|Mis libros|Expedientes/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Mi cuenta/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ir a un apartado", exact: true })).toBeFocused();
});
