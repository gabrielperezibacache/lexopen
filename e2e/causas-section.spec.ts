import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("causas conserva un expediente general limpio y el acceso judicial separado", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/causas");
  await expect(page.getByTestId("manual-cases-workspace")).toBeVisible();
  await expect(page.getByTestId("causas-section-tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Causas", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(4);
  for (const name of ["Causa", "Situación", "Actualización", "Opciones"]) await expect(page.getByRole("columnheader", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Origen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Origen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Seguimiento", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Estado de la causa", exact: true }).selectOption("all");
  await page.getByRole("searchbox", { name: "Buscar causas", exact: true }).fill("C-4521-2025");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/causas\?q=C-4521-2025&estado=all$/);
  await expect(page.getByText("C-4521-2025", { exact: false })).toBeVisible();

  await page.goto("/pjud");
  await expect(page.getByTestId("pjud-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PJUD · Chile", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(4);
  await page.getByRole("link", { name: "Ingresar con ClaveÚnica", exact: true }).click();
  await expect(page).toHaveURL(/\/causas\/mis-causas/);
  await expect(page.getByTestId("causas-section-tabs")).toBeVisible();
  await expect(page.getByRole("region", { name: "Su cuenta judicial, su cartera", exact: true })).toBeVisible();
  await page.getByText("Acceso guardado del estudio y sincronización programada", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Ver en Expediente" }).first()).toHaveAttribute("href", "/pjud?origen=claveunica");

  await page.getByTestId("causas-section-tabs").getByRole("link", { name: "Cartera PJUD" }).click();
  await expect(page.getByRole("heading", { name: "Cartera PJUD", exact: true })).toBeVisible();
  const filter = page.getByRole("combobox", { name: "Mostrar causas", exact: true });
  await expect(filter).toHaveValue("monitoreadas");
  await filter.selectOption("todas");
  await expect(filter).toHaveValue("todas");
  await page.getByTestId("causas-section-tabs").getByRole("link", { name: "ClaveÚnica", exact: true }).click();
  await expect(page.getByTestId("causas-section-tabs").getByRole("link", { name: "ClaveÚnica", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goto("/causas/nueva");
  await expect(page.getByTestId("causas-section-tabs")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nueva causa", exact: true })).toBeVisible();
});

test("un asistente no opera ClaveÚnica", async ({ page }) => {
  await loginAs(page, "asistente@estudio.cl");
  await page.goto("/causas/mis-causas");
  await expect(page.getByRole("heading", { name: "Mis Causas en OJV", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Su cuenta judicial, su cartera", exact: true }).getByRole("button", { name: "Ingresar con ClaveÚnica", exact: true })).toBeDisabled();
  await page.getByText("Acceso guardado del estudio y sincronización programada", { exact: true }).click();
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

test("avisos del canal PJUD van al log de Configuración, no a Cartera", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");

  await page.goto("/causas/monitoreo");
  await expect(page.getByRole("heading", { name: "Cartera PJUD" })).toBeVisible();
  await expect(page.getByText("El servicio auxiliar no responde")).toHaveCount(0);

  await page.goto("/causas/mis-causas");
  await expect(
    page.getByRole("heading", { name: "Mis Causas en OJV", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Su cuenta judicial, su cartera", exact: true })).toBeVisible();
  await expect(page.getByText("Aviso del Host")).toHaveCount(0);

  await page.goto("/configuracion#pjud-log");
  await expect(page.getByRole("region", { name: "Seguridad y avisos" }).getByTestId("pjud-ops-log")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log PJUD" })).toBeVisible();
});

test("un cliente sigue sin Causas", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");
  await expect(page.getByRole("link", { name: "Causas" })).toHaveCount(0);
  await page.goto("/causas");
  await expect(page).toHaveURL(/\/portal$/);
});
