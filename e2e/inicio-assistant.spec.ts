import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("un abogado agenda una audiencia desde Inicio y aparece en el calendario", async ({
  page,
}) => {
  await loginAs(page, "abogado@estudio.cl");
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId("inicio-status-line")).toBeVisible();

  const composer = page.getByTestId("inicio-composer");
  await composer.fill("agenda una audiencia mañana a las 10 sobre prueba e2e");
  await page.getByTestId("inicio-send").click();

  const confirmButton = page.getByTestId("plan-confirm");
  await expect(confirmButton).toBeVisible({ timeout: 20_000 });
  await confirmButton.click();

  await expect(page.getByTestId("assistant-result-card").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/agendad/i).first()).toBeVisible();

  await page.goto("/calendario?tipo=evento");
  await expect(page.getByText(/prueba e2e/i).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("un cliente no puede acceder a Inicio ni al asistente", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/portal$/);

  const assistantRes = await page.request.post("/api/assistant", {
    data: { text: "hola" },
  });
  expect(assistantRes.status()).toBe(403);

  const confirmRes = await page.request.post("/api/assistant/confirm", {
    data: { planId: "x", confirm: true },
  });
  expect(confirmRes.status()).toBe(403);
});
