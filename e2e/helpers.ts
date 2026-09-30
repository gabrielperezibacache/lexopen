import type { Page, Response } from "@playwright/test";

async function waitLoginResponse(page: Page, timeout = 15_000): Promise<Response> {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/login") &&
      res.request().method() === "POST",
    { timeout }
  );
}

/**
 * Login estable: selectores por name/type (no dependen del idioma).
 * Staff → /inicio (o /dashboard legado); portal → /portal.
 * Reintenta una vez ante 429 (cascada de reintentos e2e en CI).
 */
export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("lexopen");

  const first = waitLoginResponse(page);
  await page.locator('button[type="submit"]').click();
  let response = await first;

  if (response.status() === 429) {
    const retryAfterSec = Math.min(
      Number(response.headers()["retry-after"] || 8),
      20
    );
    await page.waitForTimeout(retryAfterSec * 1000);
    const retry = waitLoginResponse(page);
    await page.locator('button[type="submit"]').click();
    response = await retry;
  }

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `loginAs(${email}) falló HTTP ${response.status()}: ${body.slice(0, 200)}`
    );
  }

  await page.waitForURL(/\/(inicio|dashboard|portal)(?:\?|$|\/)/, {
    timeout: 20_000,
  });
}
