import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * Smoke de roles 1.1: personas muestra presets nuevos y pendientes unificados.
 * El muro ético profundo se cubre en unit/contract (causa-access / permissions).
 */
test("personas expone roles de estudio y pendientes unificados", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");

  await page.goto("/personas");
  await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible();
  await expect(page.getByTestId("people-manager")).toBeVisible();

  await page.getByRole("button", { name: "Crear usuario" }).click();
  const roleSelect = page.locator('select[name="role"]');
  await expect(roleSelect).toBeVisible();
  await expect(roleSelect.locator('option[value="socio"]')).toHaveCount(1);
  await expect(roleSelect.locator('option[value="procurador"]')).toHaveCount(1);
  await expect(roleSelect.locator('option[value="contabilidad"]')).toHaveCount(
    1
  );
  await page.keyboard.press("Escape");

  await page.goto("/tareas");
  await expect(
    page.getByRole("heading", { name: /Pendientes|To-dos/i })
  ).toBeVisible();
  await expect(page.getByText(/Bandeja|Vencidas|Hoy/i).first()).toBeVisible();
});
