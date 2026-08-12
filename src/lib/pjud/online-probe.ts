/**
 * Probes online contra OJV / salas (smoke sin CAPTCHA solver).
 * Útil para validar red + browser en el host antes de scrapear causas.
 */

import {
  OJV,
  OJV_HOME,
  BROWSER_UA,
} from "@/lib/pjud/ojv-dom";
import { launchPjudBrowser, PjudScrapeError } from "@/lib/pjud/public-scrape";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import { assertSafeSalasUrl, defaultSalasUrl } from "@/lib/pjud/salas-url";

export type OnlineProbeResult = {
  ok: boolean;
  timestamp: string;
  captchaConfigured: boolean;
  browser: {
    ok: boolean;
    channel?: "chromium" | "chrome";
    error?: string;
  };
  ojv: {
    ok: boolean;
    status?: number | null;
    title?: string;
    url?: string;
    guestEntry?: boolean;
    consultaForm?: boolean;
    captchaLikely?: boolean;
    error?: string;
  };
  salas: {
    ok: boolean;
    status?: number | null;
    restricted?: boolean;
    title?: string;
    bodyLen?: number;
    error?: string;
    note?: string;
  };
};

function salasPortalUrl() {
  return assertSafeSalasUrl(defaultSalasUrl());
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function probePjudOnline(opts?: {
  timeoutMs?: number;
  skipOjv?: boolean;
  skipSalas?: boolean;
}): Promise<OnlineProbeResult> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const result: OnlineProbeResult = {
    ok: false,
    timestamp: new Date().toISOString(),
    captchaConfigured: captchaSolverConfigured(),
    browser: { ok: false },
    ojv: { ok: false },
    salas: { ok: false },
  };

  let browser: import("playwright").Browser | null = null;
  try {
    const launched = await launchPjudBrowser();
    browser = launched.browser;
    result.browser = { ok: true, channel: launched.channel };
  } catch (error) {
    result.browser = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return result;
  }

  try {
    if (!opts?.skipOjv) {
      const page = await browser.newPage({
        userAgent: BROWSER_UA,
        viewport: { width: 1280, height: 900 },
      });
      page.setDefaultTimeout(Math.min(timeoutMs, 45_000));
      try {
        const res = await page.goto(OJV_HOME, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        const status = res?.status() ?? null;
        const title = await page.title().catch(() => "");
        let guestEntry = false;
        const acceso = page.locator(OJV.accesoConsulta);
        if ((await acceso.count()) > 0) {
          guestEntry = true;
          await Promise.all([
            page
              .waitForNavigation({
                waitUntil: "domcontentloaded",
                timeout: 45_000,
              })
              .catch(() => undefined),
            acceso.first().click().catch(() => undefined),
          ]);
          await delay(1200);
        } else {
          const hasFn = await page.evaluate(
            () => typeof (window as unknown as { accesoConsultaCausas?: () => void }).accesoConsultaCausas === "function"
          );
          if (hasFn) {
            guestEntry = true;
            await page.evaluate(() => {
              (
                window as unknown as { accesoConsultaCausas: () => void }
              ).accesoConsultaCausas();
            });
            await delay(2000);
          }
        }

        const html = await page.content();
        const captchaLikely =
          (await page.locator(OJV.captchaImg).count()) > 0 ||
          /g-recaptcha|hcaptcha|data-sitekey|captcha/i.test(html);
        const consultaForm =
          (await page.locator(OJV.competencia).count()) > 0 ||
          (await page.locator("#BusJuridica").count()) > 0 ||
          (await page.locator(OJV.tabBusRol).count()) > 0;

        result.ojv = {
          ok: status !== null && status < 400,
          status,
          title,
          url: page.url(),
          guestEntry,
          consultaForm,
          captchaLikely,
        };
      } catch (error) {
        result.ojv = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    if (!opts?.skipSalas) {
      const page = await browser.newPage({
        userAgent: BROWSER_UA,
        viewport: { width: 1280, height: 900 },
      });
      page.setDefaultTimeout(Math.min(timeoutMs, 30_000));
      try {
        const res = await page.goto(salasPortalUrl(), {
          waitUntil: "domcontentloaded",
          timeout: Math.min(timeoutMs, 30_000),
        });
        const status = res?.status() ?? null;
        const html = await page.content();
        const text = await page.innerText("body").catch(() => "");
        const restricted =
          /acceso restringido/i.test(text) ||
          /acceso restringido/i.test(html) ||
          html.trim().length < 200;
        result.salas = {
          ok: status !== null && status < 400,
          status,
          restricted,
          title: await page.title().catch(() => ""),
          bodyLen: html.length,
          note: restricted
            ? "Portal salas.pjud.cl responde 'acceso restringido' desde este host; use POST /api/pjud/salas con html pegado o demo."
            : "Portal accesible; parsear HTML con parseSalasTablaHtml.",
        };
      } catch (error) {
        result.salas = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  result.ok = result.browser.ok && (result.ojv.ok || Boolean(opts?.skipOjv));
  return result;
}

/** Fetch HTML de salas si el portal no está restringido. */
export async function fetchSalasPortalHtml(opts?: {
  url?: string;
  timeoutMs?: number;
}): Promise<{
  html: string;
  restricted: boolean;
  status: number | null;
  url: string;
}> {
  let url: string;
  try {
    url = assertSafeSalasUrl(opts?.url);
  } catch (error) {
    throw new PjudScrapeError(
      error instanceof Error ? error.message : String(error)
    );
  }
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const { browser } = await launchPjudBrowser();
  try {
    const page = await browser.newPage({
      userAgent: BROWSER_UA,
      viewport: { width: 1280, height: 900 },
    });
    try {
      const res = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      const status = res?.status() ?? null;
      const html = await page.content();
      const text = await page.innerText("body").catch(() => "");
      const restricted =
        /acceso restringido/i.test(text) ||
        /acceso restringido/i.test(html) ||
        html.replace(/<[^>]+>/g, "").trim().length < 40;
      if (restricted) {
        return { html: "", restricted: true, status, url };
      }
      return { html, restricted: false, status, url };
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (error) {
    throw new PjudScrapeError(
      `No se pudo abrir salas (${url}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}
