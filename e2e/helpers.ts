import type { Page, Response } from "@playwright/test";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";

/** Explicit opt-in for HTTP fixtures that exercise the compiled production server. */
export async function authenticateApiRequests(page: Page) {
  await page.waitForLoadState("networkidle");
  const origin = new URL(page.url()).origin;
  const token = (await page.context().cookies(origin)).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  if (!token) throw Error("The authenticated browser must have a CSRF cookie");
  await page.context().setExtraHTTPHeaders({ Origin: origin, [CSRF_HEADER]: token, "Accept-Language": "es-CL,es;q=0.9" });
}

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
 * En e2e (`LEXOPEN_E2E=1` / NODE_ENV=test) los buckets de login son altos
 * y la puerta de enrolamiento 2FA privilegiado está relajada (seed sin TOTP;
 * `FirmSettings.require2faPrivileged=false` en demo). Aún así reintenta una
 * vez ante 429 residual.
 */
export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("lexopen");

  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = waitLoginResponse(page);
    await page.locator('button[type="submit"]').click();
    const response = await pending;

    if (response.status() === 429 && attempt === 0) {
      const retryAfterSec = Math.min(
        Number(response.headers()["retry-after"] || 5),
        15
      );
      await page.waitForTimeout(retryAfterSec * 1000);
      continue;
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
    return;
  }
}
