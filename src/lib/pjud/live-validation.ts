/** Manual-session validation only: no vault, database, queue, solver or persistence. */
import type { Page } from "playwright";
import { OJV } from "@/lib/pjud/ojv-dom";
import { collectMisCausasFromAuthenticatedOjv } from "@/lib/pjud/public-scrape";
import { isOjvSessionUrl, pjudValidationErrorCode, redactedPjudValidationUrl } from "@/lib/pjud/ojv-oidc";

export type ManualMisCausasValidation = {
  checkedAt: string;
  pageUrl: string | null;
  status: "listed" | "empty-or-unverified" | "not-on-ojv" | "mis-causas-unavailable" | "failed";
  openedMenu: boolean;
  materiasTried: string[];
  itemCount: number | null;
  error?: ReturnType<typeof pjudValidationErrorCode>;
};

/**
 * Call only after the user completes login in a fresh visible browser context.
 * No credentials are accepted. Terms and other confirmations remain manual.
 * Returns aggregates only; a zero count does not establish an authenticated empty portfolio.
 */
export async function readManuallyAuthenticatedMisCausas(
  page: Page,
  options: { responseTimeoutMs?: number } = {}
): Promise<ManualMisCausasValidation> {
  const result: ManualMisCausasValidation = {
    checkedAt: new Date().toISOString(),
    pageUrl: redactedPjudValidationUrl(page.url()),
    status: "not-on-ojv",
    openedMenu: false,
    materiasTried: [],
    itemCount: null,
  };
  if (!isOjvSessionUrl(page.url())) return result;
  try {
    // Do not navigate away from login/terms screens or accept any prompt.
    if (!(await page.locator(OJV.misCausasMenu).filter({ visible: true }).count())) {
      return { ...result, status: "mis-causas-unavailable" };
    }
    const { items, openedMenu, materiasTried } = await collectMisCausasFromAuthenticatedOjv(page, { allowPrompts: false, responseTimeoutMs: options.responseTimeoutMs });
    return {
      ...result,
      pageUrl: redactedPjudValidationUrl(page.url()),
      status: items.length > 0 && openedMenu ? "listed" : "empty-or-unverified",
      openedMenu,
      materiasTried,
      itemCount: items.length,
    };
  } catch (error) {
    return { ...result, status: "failed", error: pjudValidationErrorCode(error) };
  }
}
