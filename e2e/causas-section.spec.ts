import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("un abogado ve un menú Causas con tres pestañas y sin ítems duplicados", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/causas");

  await expect(page.getByTestId("causas-section-tabs")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Apartado causas" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Causas judiciales" })
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Estado de la causa" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Origen" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Monitoreo PJUD" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mis Causas CU" })).toHaveCount(0);

  await page.getByTestId("causas-section-tabs").getByRole("link", { name: "Cartera PJUD" }).click();
  await expect(page).toHaveURL(/\/causas\/monitoreo/);
  await expect(page.getByRole("heading", { name: "Cartera PJUD" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Monitoreadas", exact: true })
  ).toBeVisible();

  await page.getByTestId("causas-section-tabs").getByRole("link", { name: "ClaveÚnica" }).click();
  await expect(page).toHaveURL(/\/causas\/mis-causas/);
  await expect(page.getByRole("heading", { name: "ClaveÚnica", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver en Expediente" }).first()).toBeVisible();

  await page.goto("/causas/nueva");
  await expect(page.getByTestId("causas-section-tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nueva causa" })).toBeVisible();
});

test("un asistente no opera ClaveÚnica", async ({ page }) => {
  await loginAs(page, "asistente@estudio.cl");
  await page.goto("/causas/mis-causas");
  await expect(page.getByRole("heading", { name: "ClaveÚnica", exact: true })).toBeVisible();
  await expect(
    page.getByText("no guardar credenciales ni sincronizar")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sincronizar ahora" })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Guardar de forma segura" })
  ).toBeDisabled();

  const sync = await page.request.post("/api/pjud/mis-causas", {
    data: { action: "sync" },
  });
  expect(sync.status()).toBe(403);
});

test("un cliente sigue sin Causas", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");
  await expect(page.getByRole("link", { name: "Causas" })).toHaveCount(0);
  await page.goto("/causas");
  await expect(page).toHaveURL(/\/portal$/);
});
