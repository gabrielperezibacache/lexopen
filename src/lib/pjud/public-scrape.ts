/**
 * Scrape de Consulta Unificada / Oficina Judicial Virtual (flujo CausaMonitor).
 *
 * OPT-IN + ToS risk: requiere PJUD_PUBLIC_SCRAPE=1 y solver CAPTCHA.
 * Usa Playwright + 2Captcha/CapSolver (mismo diseño que mcp-legal-chile).
 */

import {
  captchaSolverConfigured,
  CaptchaSolveError,
  CaptchaSolverConfigError,
  solveImageCaptcha,
} from "@/lib/pjud/captcha-solver";
import {
  parseCausasListFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
} from "@/lib/pjud/parse-html";
import type { MisCausasItem } from "@/lib/pjud/types";
import { type PjudCausaRef, type PjudFetchedMovimiento } from "@/lib/pjud/types";

export type { MisCausasItem } from "@/lib/pjud/types";

const OJV_BASE = "https://oficinajudicialvirtual.pjud.cl";
const OJV_SEARCH_URL = `${OJV_BASE}/home/index.php`;
export const PJUD_CONSULTA_URL =
  "https://www.pjud.cl/consulta-unificada-de-causas";

export function publicScrapeEnabled() {
  return process.env.PJUD_PUBLIC_SCRAPE === "1";
}

export async function playwrightAvailable() {
  try {
    const pw = await import("playwright");
    return Boolean(pw.chromium);
  } catch {
    return false;
  }
}

export function publicScrapeReady() {
  return publicScrapeEnabled() && captchaSolverConfigured();
}

/** Fail-closed check used before launching browsers. */
export async function assertPublicScrapeRuntime() {
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError(
      "PJUD_PUBLIC_SCRAPE!=1: scrape público deshabilitado (kill switch)."
    );
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      "Configure CAPTCHA_SOLVER_PROVIDER + CAPTCHA_SOLVER_API_KEY para scrapear OJV."
    );
  }
  if (!(await playwrightAvailable())) {
    throw new PjudScrapeError(
      "Playwright/Chromium no disponible. Instale `playwright` (`npx playwright install chromium`) o use PJUD_SCRAPER_URL."
    );
  }
}

export class PjudScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PjudScrapeError";
  }
}

const DAILY_SOLVE_BUDGET = Number(process.env.PJUD_CAUSAS_DAILY_SOLVE_BUDGET ?? 50);
const SESSION_TTL_MS = Number(process.env.PJUD_SESSION_TTL_MS ?? 25 * 60_000);
const solveBudgetState = { day: "", used: 0 };

type Cookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

type PjudSession = { cookies: Cookie[]; createdAt: number };

let currentSession: PjudSession | undefined;
let sessionPromise: Promise<PjudSession> | undefined;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function assertSolveBudget() {
  const day = todayUtc();
  if (solveBudgetState.day !== day) {
    solveBudgetState.day = day;
    solveBudgetState.used = 0;
  }
  if (solveBudgetState.used >= DAILY_SOLVE_BUDGET) {
    throw new PjudScrapeError(
      `Presupuesto diario CAPTCHA agotado (${DAILY_SOLVE_BUDGET}).`
    );
  }
}

function sessionIsValid(session: PjudSession | undefined) {
  return Boolean(session && Date.now() - session.createdAt < SESSION_TTL_MS);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new PjudScrapeError(
      "Playwright no está disponible. Instale `playwright` y Chromium, o configure PJUD_SCRAPER_URL."
    );
  }
}

async function solveNewSession(signal?: AbortSignal): Promise<PjudSession> {
  await assertPublicScrapeRuntime();
  assertSolveBudget();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new PjudScrapeError(
      `Chromium no arranca: ${error instanceof Error ? error.message : String(error)}. Ejecute npx playwright install chromium.`
    );
  }
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    const page = await context.newPage();
    await page.goto(OJV_SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const captchaImage = page.locator(
      'img[src*="captcha"], img[alt*="captcha" i], #captcha_image, .captcha-image img'
    );
    if ((await captchaImage.count()) > 0) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const buffer = await captchaImage.first().screenshot();
      let answer: string;
      try {
        answer = await solveImageCaptcha(buffer.toString("base64"), signal);
      } catch (error) {
        if (
          error instanceof CaptchaSolverConfigError ||
          error instanceof CaptchaSolveError
        ) {
          throw new PjudScrapeError(error.message);
        }
        throw error;
      }
      solveBudgetState.used += 1;
      const captchaInput = page.locator(
        'input[name*="captcha" i], #captcha_response, input[type="text"][id*="captcha" i]'
      );
      await captchaInput.first().fill(answer);
      const submitButton = page.locator(
        'button[type="submit"], input[type="submit"]'
      );
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25_000 })
          .catch(() => undefined),
        submitButton.first().click(),
      ]);
      if ((await captchaImage.count()) > 0) {
        throw new PjudScrapeError(
          "PJUD rechazó el CAPTCHA (solver incorrecto o sesión bloqueada)."
        );
      }
    }

    const cookies = await context.cookies();
    if (!cookies.length) {
      throw new PjudScrapeError("Sin cookie de sesión tras el CAPTCHA.");
    }
    return { cookies, createdAt: Date.now() };
  } finally {
    await browser.close();
  }
}

async function getValidSession(signal?: AbortSignal) {
  if (sessionIsValid(currentSession)) return currentSession!;
  if (sessionPromise) return sessionPromise;
  sessionPromise = solveNewSession(signal)
    .then((session) => {
      currentSession = session;
      return session;
    })
    .finally(() => {
      sessionPromise = undefined;
    });
  return sessionPromise;
}

function invalidateSession() {
  currentSession = undefined;
}

async function submitSearch(
  session: PjudSession,
  formValues: Record<string, string>,
  signal?: AbortSignal
) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    await context.addCookies(session.cookies as never[]);
    const page = await context.newPage();
    await page.goto(OJV_SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (
      (await page
        .locator('img[src*="captcha"], img[alt*="captcha" i]')
        .count()) > 0
    ) {
      invalidateSession();
      throw new PjudScrapeError(
        "Sesión OJV expirada (CAPTCHA reapareció). Reintente."
      );
    }

    for (const [selector, value] of Object.entries(formValues)) {
      const field = page.locator(selector).first();
      if ((await field.count()) === 0) continue;
      const tag = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      if (tag === "select") {
        await field
          .selectOption({ label: value })
          .catch(async () => {
            await field.selectOption({ value }).catch(() => undefined);
          });
      } else {
        await field.fill(value).catch(() => undefined);
      }
    }
    const submitButton = page.locator(
      'button[type="submit"], input[type="submit"]'
    );
    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
        .catch(() => undefined),
      submitButton
        .first()
        .click()
        .catch(() => undefined),
    ]);
    const detailLink = page.locator(
      'a:has-text("Historia"), a:has-text("Detalle"), a:has-text("Ver causa"), a:has-text("Ver")'
    );
    if ((await detailLink.count()) > 0) {
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 })
          .catch(() => undefined),
        detailLink.first().click().catch(() => undefined),
      ]);
    }
    return { html: await page.content(), url: page.url() };
  } finally {
    await browser.close();
  }
}

export type ScrapeLookupResult = {
  movimientos: PjudFetchedMovimiento[];
  sala: string | null;
  note: string;
  portalUrl: string;
};

/**
 * Lookup por RIT/ROL + tribunal — equivalente al sync inmediato de CausaMonitor.
 */
export async function scrapeCausaByRol(
  causa: PjudCausaRef,
  signal?: AbortSignal
): Promise<ScrapeLookupResult> {
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError(
      "PJUD_PUBLIC_SCRAPE!=1: scrape público deshabilitado (kill switch)."
    );
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      "Configure CAPTCHA_SOLVER_PROVIDER + CAPTCHA_SOLVER_API_KEY para scrapear OJV."
    );
  }
  if (!causa.rit && !causa.ruc) {
    throw new PjudScrapeError("Se requiere RIT/ROL o RUC para scrapear la causa.");
  }

  const formValues: Record<string, string> = {};
  if (causa.rit) {
    formValues['input[name*="rol" i], input[name*="rit" i]'] = causa.rit;
  }
  if (causa.ruc) {
    formValues['input[name*="ruc" i]'] = causa.ruc;
  }
  if (causa.tribunal) {
    formValues['select[name*="tribunal" i], input[name*="tribunal" i]'] =
      causa.tribunal;
  }

  let html: string;
  try {
    const session = await getValidSession(signal);
    ({ html } = await submitSearch(session, formValues, signal));
  } catch (error) {
    if (error instanceof PjudScrapeError) {
      invalidateSession();
      const fresh = await getValidSession(signal);
      ({ html } = await submitSearch(fresh, formValues, signal));
    } else {
      throw error;
    }
  }

  const movimientos = parseMovimientosFromHtml(html);
  const sala = parseSalaFromHtml(html);
  if (movimientos.length === 0) {
    throw new PjudScrapeError(
      `Sin movimientos parseables para ${causa.rit || causa.ruc}. Portal: ${PJUD_CONSULTA_URL}`
    );
  }

  return {
    movimientos,
    sala,
    note: `Scrape OJV (CAPTCHA): ${movimientos.length} movimiento(s)${sala ? ` · ${sala}` : ""}. No oficial; verifique en ${PJUD_CONSULTA_URL}`,
    portalUrl: PJUD_CONSULTA_URL,
  };
}

/**
 * Busca causas públicas por RUT de litigante (Consulta Unificada).
 */
export async function scrapeCausasByRut(
  rut: string,
  signal?: AbortSignal
): Promise<MisCausasItem[]> {
  if (!publicScrapeReady()) {
    throw new PjudScrapeError(
      "Scrape público no listo (PJUD_PUBLIC_SCRAPE + CAPTCHA)."
    );
  }
  const formValues: Record<string, string> = {
    'input[name*="rut" i], input[name*="run" i]': rut.trim(),
  };
  let html: string;
  try {
    const session = await getValidSession(signal);
    ({ html } = await submitSearch(session, formValues, signal));
  } catch (error) {
    if (error instanceof PjudScrapeError) {
      invalidateSession();
      const fresh = await getValidSession(signal);
      ({ html } = await submitSearch(fresh, formValues, signal));
    } else {
      throw error;
    }
  }
  const items = parseCausasListFromHtml(html);
  if (items.length === 0) {
    throw new PjudScrapeError(`Sin causas para RUT ${rut} en Consulta Unificada.`);
  }
  return items;
}

/**
 * Login ClaveÚnica en OJV y lista "Mis Causas" (flujo CausaMonitor).
 * Requiere PJUD_CLAVEUNICA_SCRAPE=1 además del scrape público.
 */
export async function scrapeMisCausasWithClaveUnica(opts: {
  rut: string;
  password: string;
  signal?: AbortSignal;
}): Promise<MisCausasItem[]> {
  if (process.env.PJUD_CLAVEUNICA_SCRAPE !== "1") {
    throw new PjudScrapeError(
      "PJUD_CLAVEUNICA_SCRAPE!=1: automatización ClaveÚnica deshabilitada."
    );
  }
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError("Active también PJUD_PUBLIC_SCRAPE=1.");
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError("CAPTCHA solver requerido para ClaveÚnica/OJV.");
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    const page = await context.newPage();
    await page.goto(OJV_SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    // CAPTCHA gate if present
    const captchaImage = page.locator(
      'img[src*="captcha"], img[alt*="captcha" i], #captcha_image'
    );
    if ((await captchaImage.count()) > 0) {
      assertSolveBudget();
      const buffer = await captchaImage.first().screenshot();
      const answer = await solveImageCaptcha(buffer.toString("base64"), opts.signal);
      solveBudgetState.used += 1;
      await page
        .locator('input[name*="captcha" i], #captcha_response')
        .first()
        .fill(answer);
      await page.locator('button[type="submit"], input[type="submit"]').first().click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }

    // Navigate toward ClaveÚnica login
    const cuLink = page.locator(
      'a:has-text("ClaveÚnica"), a:has-text("Clave Unica"), a:has-text("Iniciar sesión"), a[href*="claveunica"], a[href*="accounts.claveunica"]'
    );
    if ((await cuLink.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined),
        cuLink.first().click(),
      ]);
    } else {
      await page.goto("https://accounts.claveunica.gob.cl/accounts/login/", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
    }

    const rutField = page.locator(
      'input[name*="run" i], input[name*="rut" i], #uname, input[id*="rut" i]'
    );
    const passField = page.locator(
      'input[type="password"], input[name*="password" i], #pword'
    );
    if ((await rutField.count()) === 0 || (await passField.count()) === 0) {
      throw new PjudScrapeError(
        "No se encontró el formulario ClaveÚnica (layout cambió o bloqueo anti-bot)."
      );
    }
    await rutField.first().fill(opts.rut);
    await passField.first().fill(opts.password);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => undefined);

    // Try Mis Causas section
    const misCausas = page.locator(
      'a:has-text("Mis Causas"), a:has-text("Mis causas"), a[href*="mis-causas"], a[href*="miscausas"]'
    );
    if ((await misCausas.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined),
        misCausas.first().click(),
      ]);
    }

    const html = await page.content();
    const items = parseCausasListFromHtml(html);

    if (items.length === 0) {
      throw new PjudScrapeError(
        "Login ClaveÚnica OK o parcial, pero no se listaron Mis Causas. Revise credenciales o layout OJV."
      );
    }
    return items;
  } finally {
    await browser.close();
  }
}
