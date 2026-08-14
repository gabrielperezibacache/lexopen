/**
 * Live verification: OJV → AutenticaCUnica/#cuform → formulario RUN+clave.
 * Sin credenciales reales (no envía el login).
 *
 * Usage:
 *   npx tsx scripts/pjud-claveunica-form-probe.ts
 *   npm run pjud:claveunica:form
 *
 * Exit 0 = formulario visible en accounts.claveunica.gob.cl (OIDC con ?next=).
 * Exit 2 = fallo reproducible (p. ej. se abrió el portal marketing).
 */
import assert from "node:assert/strict";
import {
  CLAVEUNICA_LOGIN_URLS,
  CLAVEUNICA_PASSWORD_SELECTORS,
  CLAVEUNICA_RUT_SELECTORS,
  formatClaveUnicaRunInput,
  isClaveUnicaAccountsUrl,
  playwrightAvailable,
} from "../src/lib/pjud/public-scrape";
import { OJV_HOME } from "../src/lib/pjud/ojv-dom";

type ProbeResult = {
  playwright: boolean;
  ojvHome: { ok: boolean; status?: number; error?: string };
  loginUrls: Array<{ url: string; status: number | null; error?: string }>;
  oidc: {
    started: string | null;
    opened: boolean;
    finalUrl?: string;
    isAccounts?: boolean;
    isMarketing?: boolean;
    error?: string;
  };
  form: {
    ok: boolean;
    rutVisible: boolean;
    passwordVisible: boolean;
    fillOk: boolean;
    via: "ojv-oidc" | "none";
    pageUrl?: string;
    title?: string;
    error?: string;
  };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMarketingPortal(url: string) {
  try {
    const u = new URL(url);
    return (
      /claveunica\.gob\.cl$/i.test(u.hostname) &&
      !/^accounts\./i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

async function main() {
  assert.equal(formatClaveUnicaRunInput("19606213-0"), "19.606.213-0");
  assert.ok(CLAVEUNICA_LOGIN_URLS.every((u) => !u.endsWith("/login/")));
  assert.equal(isClaveUnicaAccountsUrl("https://claveunica.gob.cl/"), false);

  const result: ProbeResult = {
    playwright: await playwrightAvailable(),
    ojvHome: { ok: false },
    loginUrls: [],
    oidc: { started: null, opened: false },
    form: {
      ok: false,
      rutVisible: false,
      passwordVisible: false,
      fillOk: false,
      via: "none",
    },
  };

  if (!result.playwright) {
    console.log(JSON.stringify(result, null, 2));
    console.error("FAIL: Playwright/Chromium no disponible");
    process.exit(2);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    for (const url of [
      ...CLAVEUNICA_LOGIN_URLS,
      "https://accounts.claveunica.gob.cl/accounts/login/",
    ]) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        result.loginUrls.push({ url, status: res.status });
      } catch (error) {
        result.loginUrls.push({
          url,
          status: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const context = await browser.newContext({
      locale: "es-CL",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();

    try {
      const res = await page.goto(OJV_HOME, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      result.ojvHome = { ok: Boolean(res && res.ok()), status: res?.status() };
    } catch (error) {
      result.ojvHome = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (result.ojvHome.ok) {
      try {
        await page.waitForTimeout(1500);
        const started = await page.evaluate(() => {
          const w = window as unknown as { AutenticaCUnica?: () => void };
          if (typeof w.AutenticaCUnica === "function") {
            w.AutenticaCUnica();
            return "AutenticaCUnica";
          }
          const form = document.querySelector(
            "#cuform"
          ) as HTMLFormElement | null;
          if (form) {
            form.submit();
            return "cuform";
          }
          return null;
        });
        result.oidc.started = started;

        const popupPromise = context
          .waitForEvent("page", { timeout: 10_000 })
          .catch(() => null);
        const navPromise = page
          .waitForURL(/accounts\.claveunica\.gob\.cl/i, { timeout: 45_000 })
          .catch(() => undefined);

        const popup = await popupPromise;
        await navPromise;
        const active = popup || page;
        if (popup) {
          await popup
            .waitForLoadState("domcontentloaded")
            .catch(() => undefined);
        }

        const finalUrl = active.url();
        result.oidc.finalUrl = finalUrl;
        result.oidc.isAccounts = isClaveUnicaAccountsUrl(finalUrl);
        result.oidc.isMarketing = isMarketingPortal(finalUrl);
        result.oidc.opened = Boolean(result.oidc.isAccounts);

        if (result.oidc.isMarketing) {
          result.oidc.error =
            "Se abrió el portal ciudadano (claveunica.gob.cl), no el OIDC accounts.*";
        }

        if (result.oidc.opened) {
          await active
            .waitForLoadState("networkidle", { timeout: 15_000 })
            .catch(() => undefined);
          const formOk = await waitForLoginForm(active);
          let fillOk = false;
          if (formOk.ok) {
            const sample = formatClaveUnicaRunInput("12345678-5");
            const rut = active.locator(CLAVEUNICA_RUT_SELECTORS).first();
            const pass = active
              .locator(CLAVEUNICA_PASSWORD_SELECTORS)
              .first();
            await rut.fill(sample);
            await pass.fill("probe-no-submit");
            const rutVal = await rut.inputValue().catch(() => "");
            const passVal = await pass.inputValue().catch(() => "");
            fillOk = rutVal.includes("12.345.678") && passVal.length > 0;
            // No click en INGRESA — solo validamos selectores.
          }
          result.form = {
            ...formOk,
            fillOk,
            via: "ojv-oidc",
            pageUrl: finalUrl,
          };
        }
      } catch (error) {
        result.oidc.error =
          error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.oidc.isMarketing) {
    console.error(
      "FAIL: el flujo abrió el marketing de ClaveÚnica, no accounts.* OIDC"
    );
    process.exit(2);
  }
  if (!result.form.ok || !result.form.fillOk) {
    console.error(
      "FAIL: no se vio/rellenó el formulario RUN/contraseña OIDC en vivo"
    );
    process.exit(2);
  }
  console.error(
    `OK: OIDC form vía ${result.oidc.started} (rut=${result.form.rutVisible}, pass=${result.form.passwordVisible}, fill=${result.form.fillOk})`
  );
  process.exit(0);
}

async function waitForLoginForm(page: {
  getByPlaceholder: (r: RegExp) => {
    first: () => { isVisible: () => Promise<boolean> };
  };
  getByLabel: (r: RegExp) => {
    first: () => { isVisible: () => Promise<boolean> };
  };
  locator: (s: string) => {
    first: () => { isVisible: () => Promise<boolean> };
  };
  title: () => Promise<string>;
}) {
  const rutCandidates = [
    page.getByPlaceholder(/RUN|RUT/i).first(),
    page.getByLabel(/Ingresa tu RUN|^RUN$|RUT/i).first(),
    page.locator(CLAVEUNICA_RUT_SELECTORS).first(),
  ];
  const passCandidates = [
    page.getByPlaceholder(/ClaveÚnica|Clave Unica|contrase[nñ]a/i).first(),
    page.getByLabel(/ClaveÚnica|Clave Unica|contrase[nñ]a/i).first(),
    page.locator(CLAVEUNICA_PASSWORD_SELECTORS).first(),
  ];

  let rutVisible = false;
  let passwordVisible = false;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline && !(rutVisible && passwordVisible)) {
    for (const c of rutCandidates) {
      if (await c.isVisible().catch(() => false)) {
        rutVisible = true;
        break;
      }
    }
    for (const c of passCandidates) {
      if (await c.isVisible().catch(() => false)) {
        passwordVisible = true;
        break;
      }
    }
    if (!(rutVisible && passwordVisible)) await sleep(400);
  }

  return {
    ok: rutVisible && passwordVisible,
    rutVisible,
    passwordVisible,
    title: await page.title().catch(() => ""),
    error:
      rutVisible && passwordVisible
        ? undefined
        : `rutVisible=${rutVisible} passwordVisible=${passwordVisible}`,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
