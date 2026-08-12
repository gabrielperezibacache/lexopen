import type { Page } from "@playwright/test";

/** Login estable: selectores por name/type (no dependen del idioma de las etiquetas). */
export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("lexopen");
  await page.locator('button[type="submit"]').click();
}
