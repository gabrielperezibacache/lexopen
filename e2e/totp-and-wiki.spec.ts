import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";
import { generateTotpCode } from "../src/lib/auth/totp";

test("TOTP enroll, challenge on login, then disable", async ({ page }) => {
  await loginAs(page, "asistente@estudio.cl");
  await expect(page).toHaveURL(/\/dashboard$/);

  const setup = await page.request.post("/api/auth/totp", {
    data: { action: "setup" },
  });
  expect(setup.ok()).toBeTruthy();
  const setupBody = (await setup.json()) as { secret?: string };
  expect(setupBody.secret).toBeTruthy();
  const secret = setupBody.secret!;

  const confirm = await page.request.post("/api/auth/totp", {
    data: { action: "confirm", code: generateTotpCode(secret) },
  });
  expect(confirm.ok()).toBeTruthy();

  await page.context().clearCookies();

  await page.goto("/login");
  await page.locator('input[name="email"]').fill("asistente@estudio.cl");
  await page.locator('input[name="password"]').fill("lexopen");
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(/autenticación en dos pasos|código/i).first()).toBeVisible({
    timeout: 10_000,
  });

  const codeInput = page.locator('input[name="totp"], input[name="code"]').first();
  await codeInput.fill(generateTotpCode(secret));
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  const disable = await page.request.post("/api/auth/totp", {
    data: { action: "disable", code: generateTotpCode(secret) },
  });
  expect(disable.ok()).toBeTruthy();
});

test("staff puede crear página wiki y ver historial", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/dashboard$/);

  const sitesRes = await page.request.get("/api/sites");
  expect(sitesRes.ok()).toBeTruthy();
  const sites = (await sitesRes.json()) as Array<{ id: string }>;
  expect(sites.length).toBeGreaterThan(0);
  const siteId = sites[0]!.id;

  const title = `Wiki e2e ${Date.now()}`;
  const create = await page.request.post(`/api/sites/${siteId}/wiki`, {
    data: { title, content: "# Hola\n\nContenido de prueba." },
  });
  expect(create.status()).toBe(201);

  await page.goto(`/sites/${siteId}/wiki`);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Historial" }).first()).toBeVisible();

  const edit = await page.request.patch(`/api/sites/${siteId}/wiki`, {
    data: {
      id: ((await create.json()) as { id: string }).id,
      title,
      content: "# Hola\n\nEditado.",
    },
  });
  expect(edit.ok()).toBeTruthy();

  await page.reload();
  const hist = page.getByRole("button", { name: "Historial" }).first();
  await hist.click();
  await expect(page.getByRole("heading", { name: "Historial de revisiones" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurar" }).first()).toBeVisible();
});
