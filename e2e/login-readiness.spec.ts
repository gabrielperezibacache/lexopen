import { test, expect } from "@playwright/test";

test("login espera su comportamiento antes de aceptar credenciales", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "es-CL" });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeDisabled();
    await expect(page.locator('input[name="password"]')).toBeDisabled();
    await expect(page.getByRole("button", { name: "Preparando acceso…", exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("method", "post");
  } finally {
    await context.close();
  }
});
