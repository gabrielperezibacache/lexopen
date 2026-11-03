import type { Frame, Page } from "playwright";

/** Exact OIDC host, excluding citizen/marketing pages and lookalike URLs. */
export function isClaveUnicaAccountsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "accounts.claveunica.gob.cl";
  } catch {
    return false;
  }
}

export function isClaveUnicaMarketingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["claveunica.gob.cl", "www.claveunica.gob.cl"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isOjvSessionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["oficinajudicialvirtual.pjud.cl", "ojv.pjud.cl"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Evidence contains only public host/path labels, never query, fragment or userinfo. */
export function redactedPjudValidationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!(isClaveUnicaAccountsUrl(value) || isClaveUnicaMarketingUrl(value) || isOjvSessionUrl(value))) return null;
    const publicPath = /^\/$|^\/accounts\/login\/?$|^\/openid\/(?:login|authorize)\/?$|^\/(?:home\/)?(?:indexN?|return)\.php$/i.test(url.pathname);
    return `${url.origin}${publicPath ? url.pathname : "/[redacted-path]"}`;
  } catch {
    return null;
  }
}

/** Do not copy Playwright errors: they may contain filled values or OIDC URLs. */
export function pjudValidationErrorCode(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") return "timeout" as const;
  if (name === "AbortError") return "aborted" as const;
  if (name === "TargetClosedError") return "browser-closed" as const;
  return "browser-action-failed" as const;
}

type OidcWaitOptions = { timeoutMs?: number; includeMarketing?: boolean };

/** Observe both same-tab navigation and immediate popups BEFORE starting OIDC. */
export async function waitForOidcPageAfterTrigger<T>(
  page: Page,
  trigger: () => Promise<T>,
  options: OidcWaitOptions = {}
): Promise<{ page: Page | null; triggerResult: T }> {
  const context = page.context();
  const observed = new Map<Page, (frame: Frame) => void>();
  let settle: (page: Page | null) => void = () => undefined;
  let started = false;
  const arrival = new Promise<Page | null>((resolve) => { settle = resolve; });
  const inspect = (candidate: Page) => {
    if (!started || candidate.isClosed()) return;
    if (isClaveUnicaAccountsUrl(candidate.url()) || (options.includeMarketing && isClaveUnicaMarketingUrl(candidate.url()))) settle(candidate);
  };
  const observe = (candidate: Page) => {
    if (observed.has(candidate)) return;
    const navigated = (frame: Frame) => {
      if (frame === candidate.mainFrame()) inspect(candidate);
    };
    observed.set(candidate, navigated);
    candidate.on("framenavigated", navigated);
    inspect(candidate);
  };
  const closed = () => settle(null);
  context.on("page", observe);
  context.on("close", closed);
  observe(page);
  const timer = setTimeout(() => settle(null), options.timeoutMs ?? 45_000);
  try {
    started = true;
    const triggerResult = await trigger();
    for (const candidate of observed.keys()) inspect(candidate);
    return { page: await arrival, triggerResult };
  } finally {
    clearTimeout(timer);
    context.off("page", observe);
    context.off("close", closed);
    for (const [candidate, navigated] of observed) candidate.off("framenavigated", navigated);
  }
}

/** Only opens OJV's OIDC form; never fills or submits login credentials. */
export async function startClaveUnicaOidcFromOjv(page: Page, options: OidcWaitOptions = {}) {
  const available = await page.evaluate(() => {
    const w = window as unknown as { AutenticaCUnica?: () => void };
    if (typeof w.AutenticaCUnica === "function") return "AutenticaCUnica" as const;
    return document.querySelector("#cuform") ? "cuform" as const : null;
  }).catch(() => null);
  if (!available) return { page: null, started: null };
  const transition = await waitForOidcPageAfterTrigger(page, () => page.evaluate((kind) => {
    const w = window as unknown as { AutenticaCUnica?: () => void };
    if (kind === "AutenticaCUnica" && typeof w.AutenticaCUnica === "function") {
      w.AutenticaCUnica();
      return kind;
    }
    const form = document.querySelector("#cuform") as HTMLFormElement | null;
    if (form) { form.submit(); return "cuform" as const; }
    return null;
  }, available), options);
  return { page: transition.page, started: transition.triggerResult };
}
