/**
 * Scrape Oficina Judicial Virtual — paridad CausaMonitor.
 *
 * OPT-IN + ToS risk: requiere PJUD_PUBLIC_SCRAPE=1 y solver CAPTCHA.
 * Flujo DOM = portal OJV real (selectores de campo tipo consulta_causas_pjud).
 * NO depende de mcp-legal-chile (flujo MCP no comprobado en producción).
 *
 * Dos vías (como CausaMonitor):
 * 1) Invitado: home → accesoConsultaCausas() → tab RUT/ROL →
 *    competencia/tribunal → #btnConConsultaJur → #verDetalleJuridica → modal.
 * 2) ClaveÚnica: vault local AES-GCM → login accounts.claveunica.gob.cl →
 *    Mis Causas → monitoreo (ver scrapeMisCausasWithClaveUnica).
 *
 * A escala: sesión CAPTCHA reutilizable + presupuesto diario de solves
 * (mismo patrón operativo que un worker de cola con concurrency acotada).
 */

import {
  captchaSolverConfigured,
  CaptchaSolveError,
  CaptchaSolverConfigError,
  captchaConfigErrorMessage,
  solveImageCaptcha,
} from "@/lib/pjud/captcha-solver";
import {
  BROWSER_ARGS,
  BROWSER_UA,
  inferCompetenciaFromTribunal,
  OJV,
  OJV_CONSULTA_URL,
  OJV_HOME,
  parseRitParts,
  splitRut,
  tribunalLabelsMatch,
  type OjvCompetenciaValue,
} from "@/lib/pjud/ojv-dom";
import {
  parseCausasListFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
  parseVerDetalleJuridicaHtml,
} from "@/lib/pjud/parse-html";
import { createRequire } from "node:module";
import path from "node:path";
import type { MisCausasItem } from "@/lib/pjud/types";
import { type PjudCausaRef, type PjudFetchedMovimiento } from "@/lib/pjud/types";

export type { MisCausasItem } from "@/lib/pjud/types";
export { OJV_CONSULTA_URL as PJUD_CONSULTA_URL };

export function publicScrapeEnabled() {
  return process.env.PJUD_PUBLIC_SCRAPE === "1";
}

/** Comando único para Host clone: paquete npm + binario Chromium. */
export function pjudPlaywrightInstallHint() {
  const linux =
    process.platform === "linux"
      ? " En Debian/Ubuntu también: `npx playwright install-deps chromium`."
      : "";
  return `En el clon: npm ci && npm run pjud:chromium.${linux} Reinicie npm run web:host.`;
}

function playwrightSearchRoots() {
  const roots = [
    process.env.LEXOPEN_APP_ROOT,
    process.cwd(),
    path.resolve(process.cwd(), "..", ".."),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

export async function playwrightAvailable() {
  try {
    const pw = await loadPlaywright();
    return Boolean(pw.chromium);
  } catch {
    return false;
  }
}

export function publicScrapeReady() {
  return publicScrapeEnabled() && captchaSolverConfigured();
}

/**
 * Kill switch ClaveÚnica.
 * - `PJUD_CLAVEUNICA_SCRAPE=0` bloquea (fail-closed).
 * - `=1` permite.
 * - ausente: permite si el estudio ya guardó/habilitó credenciales en la UI.
 */
export function claveUnicaAutomationAllowed(optedIn = false) {
  const flag = process.env.PJUD_CLAVEUNICA_SCRAPE?.trim();
  if (flag === "0") return false;
  if (flag === "1") return true;
  return Boolean(optedIn);
}

export async function assertPublicScrapeRuntime() {
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError(
      "PJUD_PUBLIC_SCRAPE!=1: scrape público deshabilitado (kill switch)."
    );
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      captchaConfigErrorMessage() ||
        "Configure CAPTCHA_SOLVER_PROVIDER (+ API_KEY si aplica) para scrapear OJV."
    );
  }
  if (!(await playwrightAvailable())) {
    throw new PjudScrapeError(
      `Playwright/Chromium no disponible. ${pjudPlaywrightInstallHint()}`
    );
  }
}

export class PjudScrapeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PjudScrapeError";
    this.status = status;
  }
}

const DAILY_SOLVE_BUDGET = Number(process.env.PJUD_CAUSAS_DAILY_SOLVE_BUDGET ?? 50);
const SESSION_TTL_MS = Number(process.env.PJUD_SESSION_TTL_MS ?? 25 * 60_000);
const CACHE_TTL_MS = Number(process.env.PJUD_CAUSAS_CACHE_TTL_MS ?? 6 * 60 * 60_000);
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

type CacheEntry = { at: number; payload: unknown };
const resultCache = new Map<string, CacheEntry>();

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

function cacheGet<T>(key: string): T | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return hit.payload as T;
}

function cacheSet(key: string, payload: unknown) {
  resultCache.set(key, { at: Date.now(), payload });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // Next standalone often omits the traced package; resolve from the clone.
  }
  for (const root of playwrightSearchRoots()) {
    const candidates = [
      path.join(root, "package.json"),
      path.join(root, "node_modules", "playwright", "index.js"),
      path.join(root, "node_modules", "playwright", "package.json"),
    ];
    for (const from of candidates) {
      try {
        return createRequire(from)("playwright") as typeof import("playwright");
      } catch {
        // try next candidate
      }
    }
  }
  throw new PjudScrapeError(
    `Playwright no está disponible. ${pjudPlaywrightInstallHint()}`
  );
}

type PlaywrightPage = import("playwright").Page;

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type PjudBrowserLaunch = {
  browser: import("playwright").Browser;
  channel: "chromium" | "chrome";
};

/**
 * Lanza Chromium de Playwright; si falta el binario empaquetado, cae a
 * Google Chrome del sistema (`channel: "chrome"`) — útil en hosts cloud/CI.
 */
export async function launchPjudBrowser(): Promise<PjudBrowserLaunch> {
  const { chromium } = await loadPlaywright();
  try {
    const browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });
    return { browser, channel: "chromium" };
  } catch (bundledError) {
    try {
      const browser = await chromium.launch({
        headless: true,
        channel: "chrome",
        args: BROWSER_ARGS,
      });
      return { browser, channel: "chrome" };
    } catch (chromeError) {
      const bundled =
        bundledError instanceof Error
          ? bundledError.message
          : String(bundledError);
      const chrome =
        chromeError instanceof Error ? chromeError.message : String(chromeError);
      throw new PjudScrapeError(
        `Browser no arranca (Chromium: ${bundled}; Chrome: ${chrome}). ${pjudPlaywrightInstallHint()} Opcional: instale Google Chrome.`
      );
    }
  }
}

async function launchBrowser() {
  const { browser } = await launchPjudBrowser();
  return browser;
}

async function closeSweetAlerts(page: PlaywrightPage) {
  for (let i = 0; i < 3; i++) {
    const visible = await page.locator(OJV.sweetAlert).count();
    if (!visible) return;
    await page.locator(OJV.sweetConfirm).first().click().catch(() => undefined);
    await delay(400);
  }
}

async function closeBootstrapModals(page: PlaywrightPage) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal.in').forEach((m) => {
      const el = m as HTMLElement;
      if ((el.style.display || "").includes("block") || el.classList.contains("in")) {
        const btn = el.querySelector(
          'button[data-dismiss="modal"], .close'
        ) as HTMLElement | null;
        btn?.click();
      }
    });
  });
}

async function maybeSolveCaptchaOnPage(page: PlaywrightPage, signal?: AbortSignal) {
  const captchaImage = page.locator(OJV.captchaImg);
  if ((await captchaImage.count()) === 0) return false;
  assertSolveBudget();
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
  await page.locator(OJV.captchaInput).first().fill(answer);
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25_000 })
      .catch(() => undefined),
    page.locator(OJV.submit).first().click().catch(() => undefined),
  ]);
  if ((await captchaImage.count()) > 0) {
    throw new PjudScrapeError(
      "PJUD rechazó el CAPTCHA (solver incorrecto o sesión bloqueada)."
    );
  }
  return true;
}

async function enterConsultaCausas(page: PlaywrightPage) {
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);
  const acceso = page.locator(OJV.accesoConsulta);
  if ((await acceso.count()) > 0) {
    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
        .catch(() => undefined),
      acceso.first().click(),
    ]);
  } else {
    // Fallback: invoke the same guest session endpoint the button uses.
    await page.evaluate(async () => {
      await fetch("../includes/sesion-invitado.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "nombreAcceso=CC",
        credentials: "include",
      }).catch(() => undefined);
    });
    await page
      .goto(`${OJV_HOME.replace("/home/index.php", "")}/consultaUnificada.php`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      })
      .catch(() => undefined);
  }
  await delay(800);
  await closeSweetAlerts(page);
  await maybeSolveCaptchaOnPage(page);
}

async function waitConsultaLoader(page: PlaywrightPage) {
  await page
    .waitForFunction(
      () => {
        const l = document.querySelector("#loadPreJuridica");
        return !l || l.innerHTML.trim() === "";
      },
      { timeout: 60_000 }
    )
    .catch(() => undefined);
}

async function selectCompetencia(
  page: PlaywrightPage,
  value: OjvCompetenciaValue
) {
  const sel = page.locator(OJV.competencia);
  if ((await sel.count()) === 0) return;
  await sel.selectOption(value).catch(() => undefined);
  await page.evaluate(() => {
    const el = document.querySelector("#jurCompetencia");
    el?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await delay(600);
}

async function selectTribunalOrCorte(page: PlaywrightPage, tribunal: string) {
  const competencia = inferCompetenciaFromTribunal(tribunal);
  await selectCompetencia(page, competencia);

  if (competencia === "2") {
    const corte = page.locator(OJV.corte);
    await corte.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    const options = await page.$$eval(`${OJV.corte} option`, (arr) =>
      arr.map((o) => ({
        value: (o as HTMLOptionElement).value,
        label: (o.textContent || "").trim(),
      }))
    );
    const match = options.find(
      (o) => o.value && o.value !== "0" && tribunalLabelsMatch(o.label, tribunal)
    );
    if (match) await corte.selectOption(match.value).catch(() => undefined);
    return;
  }

  if (["3", "4", "5", "6"].includes(competencia)) {
    const trib = page.locator(OJV.tribunal);
    await trib.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    await page
      .waitForFunction(() => {
        const s = document.querySelector("#jurTribunal");
        return Boolean(s && s.querySelectorAll("option").length > 1);
      }, { timeout: 10_000 })
      .catch(() => undefined);
    const options = await page.$$eval(`${OJV.tribunal} option`, (arr) =>
      arr.map((o) => ({
        value: (o as HTMLOptionElement).value,
        label: (o.textContent || "").trim(),
      }))
    );
    const match = options.find(
      (o) =>
        o.value &&
        o.value !== "0" &&
        !/seleccione tribunal/i.test(o.label) &&
        tribunalLabelsMatch(o.label, tribunal)
    );
    if (match) {
      await trib.selectOption(match.value).catch(() => undefined);
    } else {
      // Best-effort: try label select
      await trib.selectOption({ label: tribunal }).catch(() => undefined);
    }
  }
}

async function clickBuscar(page: PlaywrightPage) {
  const btn = page.locator(OJV.btnBuscar);
  if ((await btn.count()) === 0) {
    await page.locator(OJV.submit).first().click().catch(() => undefined);
  } else {
    await btn.first().click();
  }
  await waitConsultaLoader(page);
}

async function openFirstCauseModal(page: PlaywrightPage) {
  const opened = await page.evaluate(() => {
    const rows = document.querySelectorAll("#verDetalleJuridica tr");
    for (const tr of rows) {
      if (tr.querySelector("nav") || tr.querySelector(".pagination")) continue;
      const link = tr.querySelector("td a[onclick], td a");
      if (link) {
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  if (!opened) return false;
  await page
    .waitForFunction(() => {
      const mo = document.querySelector(".modal.in");
      if (!mo) return false;
      const style = (mo as HTMLElement).style.display || "";
      return style.includes("block") || mo.classList.contains("in");
    }, { timeout: 15_000 })
    .catch(() => undefined);
  await delay(500);
  // Historia / movimientos tab if present
  const hist = page.locator(`${OJV.modal} ${OJV.historiaTab}`);
  if ((await hist.count()) > 0) {
    await hist.first().click().catch(() => undefined);
    await delay(600);
  }
  return true;
}

async function modalInnerHtml(page: PlaywrightPage) {
  return page.evaluate(() => {
    const mo = document.querySelector(".modal.in");
    return mo ? mo.innerHTML : "";
  });
}

/** Merge scrape rows by externalId; prefer receptor / pendiente flags. */
export function mergePjudMovimientos(
  base: PjudFetchedMovimiento[],
  extra: PjudFetchedMovimiento[]
) {
  const map = new Map<string, PjudFetchedMovimiento>();
  for (const m of [...base, ...extra]) {
    const prev = map.get(m.externalId);
    if (!prev) {
      map.set(m.externalId, m);
      continue;
    }
    map.set(m.externalId, {
      ...prev,
      ...m,
      esReceptor: Boolean(prev.esReceptor || m.esReceptor),
      pendienteResolucion: Boolean(
        prev.pendienteResolucion || m.pendienteResolucion
      ),
      relevante: Boolean(
        prev.relevante || m.relevante || m.esReceptor || m.pendienteResolucion
      ),
      documentoRef: m.documentoRef || prev.documentoRef,
    });
  }
  return [...map.values()].sort(
    (a, b) => b.fecha.getTime() - a.fecha.getTime()
  );
}

async function scrapeModalTabs(
  page: PlaywrightPage
): Promise<PjudFetchedMovimiento[]> {
  let movimientos = parseMovimientosFromHtml(
    (await modalInnerHtml(page)) || (await page.content())
  );

  const receptor = page.locator(`${OJV.modal} ${OJV.receptorTab}`);
  if ((await receptor.count()) > 0) {
    await receptor.first().click().catch(() => undefined);
    await delay(700);
    const receptorHtml = (await modalInnerHtml(page)) || (await page.content());
    const receptorMovs = parseMovimientosFromHtml(receptorHtml).map((m) => ({
      ...m,
      esReceptor: true,
      relevante: true,
      tipo: m.tipo === "otro" ? "notificacion" : m.tipo,
    }));
    movimientos = mergePjudMovimientos(movimientos, receptorMovs);
  }

  const escritos = page.locator(`${OJV.modal} ${OJV.escritosTab}`);
  if ((await escritos.count()) > 0) {
    await escritos.first().click().catch(() => undefined);
    await delay(700);
    const escritosHtml = (await modalInnerHtml(page)) || (await page.content());
    const escritoMovs = parseMovimientosFromHtml(escritosHtml).map((m) => {
      const pendiente =
        m.pendienteResolucion ||
        /por\s+resolver|pendiente/i.test(`${m.titulo} ${m.detalle || ""}`);
      return {
        ...m,
        tipo: "escrito" as const,
        pendienteResolucion: pendiente || m.pendienteResolucion,
        relevante: true,
      };
    });
    movimientos = mergePjudMovimientos(movimientos, escritoMovs);
  }

  return movimientos;
}

async function extractEbookRef(page: PlaywrightPage): Promise<string | null> {
  return page.evaluate(() => {
    const mo = document.querySelector(".modal.in");
    if (!mo) return null;
    let form = mo.querySelector("#contenedorEbook form") as HTMLFormElement | null;
    if (!form) {
      const forms = [...mo.querySelectorAll("form")];
      form =
        (forms.find((f) =>
          (f.getAttribute("action") || "").toLowerCase().includes("ebook")
        ) as HTMLFormElement | undefined) || null;
    }
    if (!form) return null;
    const action = form.getAttribute("action") || "";
    if (!action) return null;
    try {
      return new URL(action, location.href).href;
    } catch {
      return action;
    }
  });
}

async function solveNewSession(signal?: AbortSignal): Promise<PjudSession> {
  await assertPublicScrapeRuntime();
  assertSolveBudget();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      locale: "es-CL",
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await closeSweetAlerts(page);
    await closeBootstrapModals(page);
    await maybeSolveCaptchaOnPage(page, signal);
    // Establish guest consulta session so cookies are meaningful.
    await enterConsultaCausas(page);
    const cookies = await context.cookies();
    if (!cookies.length) {
      throw new PjudScrapeError("Sin cookie de sesión tras acceso invitado/CAPTCHA.");
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

async function withConsultaPage<T>(
  session: PjudSession,
  run: (page: PlaywrightPage) => Promise<T>
): Promise<T> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      locale: "es-CL",
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await context.addCookies(session.cookies as never[]);
    const page = await context.newPage();
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if ((await page.locator(OJV.captchaImg).count()) > 0) {
      invalidateSession();
      throw new PjudScrapeError(
        "Sesión OJV expirada (CAPTCHA reapareció). Reintente."
      );
    }
    await enterConsultaCausas(page);
    return await run(page);
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

async function scrapeCausaByRolOnce(
  causa: PjudCausaRef,
  session: PjudSession,
  signal?: AbortSignal
): Promise<ScrapeLookupResult> {
  return withConsultaPage(session, async (page) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const ritParts = causa.rit ? parseRitParts(causa.rit) : null;
    const competencia = inferCompetenciaFromTribunal(causa.tribunal || "");

    // Prefer ROL/RIT tab when available; else fall back to RUT jurídica year scan.
    const rolTab = page.locator(OJV.tabBusRol);
    let usedRolTab = false;
    if ((await rolTab.count()) > 0 && ritParts) {
      await rolTab.first().click().catch(() => undefined);
      await delay(400);
      usedRolTab = true;
      // Fill common ROL field variants used across OJV layouts.
      const fills: Array<[string, string]> = [
        ['input[id*="rit" i], input[name*="rit" i], input[id*="rol" i], input[name*="rol" i]', ritParts.numero],
        ['input[id*="era" i], input[name*="era" i], input[id*="ano" i], input[name*="ano" i]', ritParts.era],
      ];
      if (ritParts.tipo) {
        fills.push([
          'input[id*="tipo" i], select[id*="tipo" i], input[name*="tipo" i]',
          ritParts.tipo,
        ]);
      }
      for (const [sel, value] of fills) {
        const field = page.locator(sel).first();
        if ((await field.count()) === 0) continue;
        const tag = await field
          .evaluate((el) => el.tagName.toLowerCase())
          .catch(() => "");
        if (tag === "select") {
          await field
            .selectOption({ label: value })
            .catch(async () => field.selectOption({ value }).catch(() => undefined));
        } else {
          await field.fill(value).catch(() => undefined);
        }
      }
      await selectTribunalOrCorte(page, causa.tribunal || "");
    } else if (causa.ruc || causa.rit) {
      // RUT tab path (persona jurídica) — same as consulta_causas_pjud.
      const tab = page.locator(OJV.tabBusJuridica);
      if ((await tab.count()) > 0) await tab.first().click();
      await page.waitForSelector(OJV.rutJur, { timeout: 10_000 }).catch(() => undefined);
      const rutSource = causa.ruc || "";
      const split = splitRut(rutSource);
      if (split) {
        await page.fill(OJV.rutJur, split.cuerpo).catch(() => undefined);
        await page.fill(OJV.dvJur, split.dv).catch(() => undefined);
      }
      if (ritParts) {
        await page.fill(OJV.eraJur, ritParts.era).catch(() => undefined);
      }
      await selectCompetencia(page, competencia);
      await selectTribunalOrCorte(page, causa.tribunal || "");
    }

    await clickBuscar(page);

    const noResults = await page.evaluate((needle) => {
      const d = document.querySelector("#resultConsultaJuridica");
      if (!d) return false;
      return (d.textContent || "").includes(needle);
    }, OJV.noResultsText);
    if (noResults) {
      throw new PjudScrapeError(
        `Sin resultados OJV para ${causa.rit || causa.ruc}. Portal: ${OJV_CONSULTA_URL}`
      );
    }

    // If listing shows multiple rows and we have a RIT, click the matching one.
    if (causa.rit) {
      await page.evaluate((rit) => {
        const want = rit.toUpperCase().replace(/\s+/g, "");
        const rows = document.querySelectorAll("#verDetalleJuridica tr");
        for (const tr of rows) {
          const text = (tr.textContent || "").toUpperCase().replace(/\s+/g, "");
          if (!text.includes(want) && !text.includes(want.replace(/^[A-Z]+-/, ""))) {
            continue;
          }
          const link = tr.querySelector("td a");
          if (link) {
            (link as HTMLElement).click();
            return;
          }
        }
      }, causa.rit);
      await delay(700);
    }

    const modalOk = await openFirstCauseModal(page);
    let html = await page.content();
    if (modalOk) {
      const modalHtml = await modalInnerHtml(page);
      if (modalHtml) html = modalHtml;
    }

    let movimientos = modalOk
      ? await scrapeModalTabs(page)
      : parseMovimientosFromHtml(html);
    if (movimientos.length === 0) {
      // Fallback: list rows themselves as coarse movimientos
      const list = parseVerDetalleJuridicaHtml(await page.content());
      movimientos = list.map((row, idx) => ({
        externalId: `scrape:list:${row.rit}:${idx}`,
        titulo: row.caratula || row.rit,
        detalle: [row.tribunal, row.estado, row.fecha].filter(Boolean).join(" · "),
        fecha: row.fechaDate || new Date(),
        referencia: row.rit,
        tipo: "otro" as const,
        relevante: false,
        fuente: "pjud" as const,
        cuaderno: "Principal",
        folio: String(idx + 1),
        etapa: null,
        tramite: null,
        esReceptor: false,
        pendienteResolucion: false,
        documentoRef: null,
      }));
    }

    const ebook = modalOk ? await extractEbookRef(page) : null;
    if (ebook && movimientos[0] && !movimientos[0].documentoRef) {
      movimientos = movimientos.map((m, i) =>
        i === 0 ? { ...m, documentoRef: ebook } : m
      );
    }

    const sala = parseSalaFromHtml(html);
    if (movimientos.length === 0) {
      throw new PjudScrapeError(
        `Sin movimientos parseables para ${causa.rit || causa.ruc}${usedRolTab ? " (tab ROL)" : ""}. Portal: ${OJV_CONSULTA_URL}`
      );
    }

    return {
      movimientos,
      sala,
      note: `Scrape OJV (CAPTCHA/sesión): ${movimientos.length} movimiento(s)${sala ? ` · ${sala}` : ""}. No oficial; verifique en ${OJV_CONSULTA_URL}`,
      portalUrl: OJV_CONSULTA_URL,
    };
  });
}

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
      captchaConfigErrorMessage() ||
        "Configure CAPTCHA_SOLVER_PROVIDER (+ API_KEY si aplica) para scrapear OJV."
    );
  }
  if (!causa.rit && !causa.ruc) {
    throw new PjudScrapeError("Se requiere RIT/ROL o RUC para scrapear la causa.");
  }

  const cacheKey = `rol:${(causa.tribunal || "").toLowerCase()}:${(causa.rit || causa.ruc || "").toLowerCase()}`;
  const cached = cacheGet<ScrapeLookupResult>(cacheKey);
  if (cached) return { ...cached, note: `${cached.note} · cache` };

  let result: ScrapeLookupResult;
  try {
    const session = await getValidSession(signal);
    result = await scrapeCausaByRolOnce(causa, session, signal);
  } catch (error) {
    if (error instanceof PjudScrapeError) {
      invalidateSession();
      const fresh = await getValidSession(signal);
      result = await scrapeCausaByRolOnce(causa, fresh, signal);
    } else {
      throw error;
    }
  }
  cacheSet(cacheKey, result);
  return result;
}

/**
 * Busca causas públicas por RUT (Consulta Unificada · tab BusJuridica).
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
  const split = splitRut(rut);
  if (!split) throw new PjudScrapeError(`RUT inválido: ${rut}`);

  const cacheKey = `rut:${split.cuerpo}-${split.dv}`;
  const cached = cacheGet<MisCausasItem[]>(cacheKey);
  if (cached) return cached;

  const run = async (session: PjudSession) =>
    withConsultaPage(session, async (page) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const tab = page.locator(OJV.tabBusJuridica);
      if ((await tab.count()) > 0) await tab.first().click();
      await page.waitForSelector(OJV.rutJur, { timeout: 15_000 });
      await page.fill(OJV.rutJur, split.cuerpo);
      await page.fill(OJV.dvJur, split.dv);
      // Current year as default era filter (OJV requires it on this tab).
      await page
        .fill(OJV.eraJur, String(new Date().getFullYear()))
        .catch(() => undefined);

      const all: MisCausasItem[] = [];
      const competencias: OjvCompetenciaValue[] = ["3", "4", "6", "5", "2", "1"];
      for (const comp of competencias) {
        await selectCompetencia(page, comp);
        if (["3", "4", "5", "6"].includes(comp)) {
          // Leave tribunal at first real option if present (broad search).
          const trib = page.locator(OJV.tribunal);
          if ((await trib.count()) > 0) {
            const first = await page.$$eval(`${OJV.tribunal} option`, (arr) => {
              const hit = arr.find((o) => {
                const v = (o as HTMLOptionElement).value;
                const label = (o.textContent || "").toLowerCase();
                return v && v !== "0" && !label.includes("seleccione");
              });
              return hit ? (hit as HTMLOptionElement).value : null;
            });
            // Do not force a single tribunal for RUT scan — some layouts allow "todos".
            if (first) {
              /* keep default selection from OJV after competencia change */
            }
          }
        }
        await clickBuscar(page);
        const html = await page.content();
        if (html.includes(OJV.noResultsText)) continue;
        const fromTable = parseVerDetalleJuridicaHtml(html);
        if (fromTable.length) {
          all.push(
            ...fromTable.map((r) => ({
              rit: r.rit,
              tribunal: r.tribunal,
              caratula: r.caratula,
              ruc: r.ruc,
              estado: r.estado,
            }))
          );
        } else {
          all.push(...parseCausasListFromHtml(html));
        }
      }

      // Dedupe
      const seen = new Set<string>();
      const unique = all.filter((c) => {
        const key = `${c.rit}|${c.tribunal}`.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!unique.length) {
        throw new PjudScrapeError(`Sin causas para RUT ${rut} en Consulta Unificada.`);
      }
      return unique;
    });

  let items: MisCausasItem[];
  try {
    items = await run(await getValidSession(signal));
  } catch (error) {
    if (error instanceof PjudScrapeError) {
      invalidateSession();
      items = await run(await getValidSession(signal));
    } else {
      throw error;
    }
  }
  cacheSet(cacheKey, items);
  return items;
}

/**
 * Login ClaveÚnica en OJV y lista "Mis Causas" (flujo CausaMonitor).
 */
export async function scrapeMisCausasWithClaveUnica(opts: {
  rut: string;
  password: string;
  signal?: AbortSignal;
  optedIn?: boolean;
}): Promise<MisCausasItem[]> {
  if (!claveUnicaAutomationAllowed(opts.optedIn)) {
    throw new PjudScrapeError(
      "Automatización ClaveÚnica deshabilitada. Guarde las credenciales en Mis Causas o ponga PJUD_CLAVEUNICA_SCRAPE=1 (PJUD_CLAVEUNICA_SCRAPE=0 la bloquea).",
      409
    );
  }
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError(
      "Active también PJUD_PUBLIC_SCRAPE=1 en el .env del Host y reinicie.",
      409
    );
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      captchaConfigErrorMessage() ||
        "CAPTCHA solver requerido para ClaveÚnica/OJV (CAPTCHA_SOLVER_PROVIDER + CAPTCHA_SOLVER_API_KEY).",
      409
    );
  }

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      locale: "es-CL",
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await closeSweetAlerts(page);
    await maybeSolveCaptchaOnPage(page, opts.signal);

    const cuLink = page.locator(
      'a:has-text("ClaveÚnica"), a:has-text("Clave Unica"), a:has-text("Iniciar sesión"), a[href*="claveunica"], a[href*="accounts.claveunica"], #cuform a, button:has-text("ClaveÚnica")'
    );
    if ((await cuLink.count()) > 0) {
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
          .catch(() => undefined),
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
    await page.locator(OJV.submit).first().click();
    await page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => undefined);

    const misCausas = page.locator(
      'a:has-text("Mis Causas"), a:has-text("Mis causas"), a[href*="mis-causas"], a[href*="miscausas"]'
    );
    if ((await misCausas.count()) > 0) {
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
          .catch(() => undefined),
        misCausas.first().click(),
      ]);
    }

    const html = await page.content();
    const fromTable = parseVerDetalleJuridicaHtml(html);
    const items =
      fromTable.length > 0
        ? fromTable.map((r) => ({
            rit: r.rit,
            tribunal: r.tribunal,
            caratula: r.caratula,
            ruc: r.ruc,
            estado: r.estado,
          }))
        : parseCausasListFromHtml(html);

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
