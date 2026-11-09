/**
 * Scrape Oficina Judicial Virtual — paridad CausaMonitor.
 *
 * OPT-IN: requiere PJUD_PUBLIC_SCRAPE=1; solver sólo ante CAPTCHA visible.
 * Flujo DOM = portal OJV real (selectores de campo tipo consulta_causas_pjud).
 * NO depende de mcp-legal-chile (flujo MCP no comprobado en producción).
 *
 * Dos vías (como CausaMonitor):
 * 1) Público: entrada de sesión publicada por pjud.cl → tab RIT/ROL →
 *    competencia/corte/tribunal → Buscar → fila exacta → modal.
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
  causeRowMatches,
  inferCompetenciaFromTribunal,
  isPlaceholderTribunal,
  OJV,
  OJV_CONSULTA_URL,
  OJV_HOME,
  OJV_INDEX_N,
  OJV_POST_AUTH_URLS,
  parseRitParts,
  pickBestTribunalOption,
  pickCorteForTribunal,
  pickTribunalFromTexts,
  ritLabelsMatch,
  splitRut,
  tribunalLabelsMatch,
  type OjvCompetenciaValue,
} from "@/lib/pjud/ojv-dom";
import {
  hasExplicitEmptyHistory,
  parseCausasListFromHtml,
  parseMisCausasFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
  parseVerDetalleJuridicaHtml,
} from "@/lib/pjud/parse-html";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { manualPjudInteractionActive, manualPjudDocumentDownloadsAllowed } from "@/lib/pjud/manual-interaction-policy";
import path from "node:path";
import type { MisCausasItem } from "@/lib/pjud/types";
import { normalizePjudCuaderno, omitLegacyScrapeAliases, type PjudCausaRef, type PjudCuadernosCoverage, type PjudFetchedMovimiento } from "@/lib/pjud/types";
import { PJUD_MAX_CAUSA_MOVIMIENTOS, PJUD_MAX_CUADERNOS } from "@/lib/pjud/cuadernos-limits";
import { cuadernosCoverageNote, unknownCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import { isClaveUnicaAccountsUrl, startClaveUnicaOidcFromOjv, waitForOidcPageAfterTrigger } from "@/lib/pjud/ojv-oidc";
import { clearManualMisCausasRows, snapshotManualMisCausasRows, waitForFreshManualMisCausasRows, type ManualMisCausasPageState } from "@/lib/pjud/manual-mis-causas-response";
import type { Locator } from "playwright";

export type { MisCausasItem } from "@/lib/pjud/types";
export { OJV_CONSULTA_URL as PJUD_CONSULTA_URL };
export { isClaveUnicaAccountsUrl } from "@/lib/pjud/ojv-oidc";

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
  // Configuration permits an attempt; a solver is needed only for a challenge.
  return publicScrapeEnabled();
}

export function pjudCaptchaAutoSolveAllowed() {
  return !manualPjudInteractionActive() && process.env.PJUD_CAPTCHA_AUTO_SOLVE?.trim() !== "0";
}

export function pjudDocumentDownloadsAllowed() {
  return (!manualPjudInteractionActive() || manualPjudDocumentDownloadsAllowed()) && process.env.PJUD_DOC_DOWNLOADS?.trim() !== "0";
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

class PjudSessionExpiredError extends PjudScrapeError {}

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

/** Validation may dismiss known case details, but must stop at other prompts. */
export async function assertPjudPromptPolicy(page: PlaywrightPage, forceManual = false) {
  if (!forceManual && !manualPjudInteractionActive() && process.env.PJUD_AUTO_CONFIRM_PROMPTS?.trim() !== "0") return;
  const blocked = await page.locator(`${OJV.sweetAlert}, .modal.in, .modal.show, .modal[style*="display: block"]`).evaluateAll((nodes) => nodes.some((node) => {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return !(node.id.startsWith("modalDetalle") && node.querySelector("table.table-titulos"));
  }));
  if (blocked) throw new PjudScrapeError("OJV mostró un aviso que requiere intervención manual. La confirmación automática está deshabilitada.", 409);
}

async function closeSweetAlerts(page: PlaywrightPage) {
  await assertPjudPromptPolicy(page);
  for (let i = 0; i < 3; i++) {
    const visible = await page.locator(OJV.sweetAlert).filter({ visible: true }).count();
    if (!visible) return;
    await page.locator(OJV.sweetConfirm).first().click().catch(() => undefined);
    await delay(400);
  }
}

async function closeBootstrapModals(page: PlaywrightPage) {
  await assertPjudPromptPolicy(page);
  await page.evaluate(() => {
    document.querySelectorAll('.modal.in, .modal.show, .modal[style*="display: block"]').forEach((m) => {
      const el = m as HTMLElement;
      if ((el.style.display || "").includes("block") || el.classList.contains("in") || el.classList.contains("show")) {
        const btn = el.querySelector(
          'button[data-dismiss="modal"], button[data-bs-dismiss="modal"], .close'
        ) as HTMLElement | null;
        btn?.click();
      }
    });
  });
}

export async function maybeSolveCaptchaOnPage(page: PlaywrightPage, signal?: AbortSignal) {
  const captchaImages = page.locator(OJV.captchaImg);
  const visibleIndex = await captchaImages.evaluateAll((nodes) => nodes.findIndex((node) => {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  }));
  if (visibleIndex < 0) {
    if ((await readConsultaFormState(page)).captchaVisible) {
      throw new PjudScrapeError("OJV mostró un desafío CAPTCHA que requiere intervención manual.", 409);
    }
    return false;
  }
  if (!pjudCaptchaAutoSolveAllowed()) {
    throw new PjudScrapeError("OJV mostró un CAPTCHA. La resolución automática está deshabilitada; requiere intervención manual.", 409);
  }
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(captchaConfigErrorMessage() || "OJV mostró un CAPTCHA y no hay un resolutor configurado.", 409);
  }
  assertSolveBudget();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const captchaImage = captchaImages.nth(visibleIndex);
  const buffer = await captchaImage.screenshot();
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
  if ((await readConsultaFormState(page)).captchaVisible) {
    throw new PjudScrapeError(
      "PJUD rechazó el CAPTCHA (solver incorrecto o sesión bloqueada)."
    );
  }
  return true;
}

export type ConsultaFormState = {
  stage: "ready" | "login-required" | "captcha-required" | "prompt-required" | "guest-shell" | "unknown";
  readyState: DocumentReadyState;
  ready: boolean;
  loginRequired: boolean;
  captchaVisible: boolean;
  promptVisible: boolean;
  guestEntryVisible: boolean;
  consultaMenuVisible: boolean;
  consultaTabsVisible: boolean;
  fields: Array<{ tag: "input" | "select"; id: string; name: string; type: string; disabled: boolean; optionCount: number }>;
};

const CONSULTA_FIELD_SELECTOR = "select#competencia, select#jurCompetencia, input#rutJur";

/** Safe entry diagnostics: no field values, page text, URLs, cookies or tokens. */
export async function readConsultaFormState(page: PlaywrightPage): Promise<ConsultaFormState> {
  return page.evaluate(({ fieldsSelector, guestSelector, captchaSelector, tabsSelector }) => {
    const loginSelector = 'input[type="password"]';
    const promptSelector = '.sweet-alert.showSweetAlert.visible, .modal.in, .modal.show, .modal[style*="display: block"]';
    const visibleNodes = [...document.querySelectorAll(`${fieldsSelector}, ${guestSelector}, ${captchaSelector}, ${tabsSelector}, ${loginSelector}, ${promptSelector}, a`)].filter((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      let current: Element | null = node;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        current = current.parentElement;
      }
      return true;
    });
    const fields = visibleNodes.filter((node) => node.matches(fieldsSelector)).map((node) => {
      const field = node as HTMLInputElement | HTMLSelectElement;
      return {
        tag: field.tagName.toLowerCase() as "input" | "select",
        id: field.id,
        name: field.name,
        type: field instanceof HTMLInputElement ? field.type : "select",
        disabled: field.disabled,
        optionCount: field instanceof HTMLSelectElement ? field.options.length : 0,
      };
    });
    const ready = fields.length > 0;
    const loginRequired = visibleNodes.some((node) => node.matches(loginSelector));
    // An invisible reCAPTCHA badge/anchor is infrastructure, not a challenge.
    // A visible checkbox outside the badge or a challenge bframe still blocks.
    const captchaVisible = visibleNodes.some((node) => node.matches(captchaSelector) && (
      node.matches('iframe[src*="/recaptcha/api2/bframe"]') || (
        !node.closest('.grecaptcha-badge, .g-recaptcha[data-size="invisible"]') &&
        !node.matches('iframe[src*="/recaptcha/api2/anchor"][src*="size=invisible"]')
      ))
    );
    const promptVisible = visibleNodes.some((node) => node.matches(promptSelector));
    const guestEntryVisible = visibleNodes.some((node) => node.matches(guestSelector));
    const consultaMenuVisible = visibleNodes.some((node) => node.tagName === "A" && /^Consulta Unificada$/i.test((node.textContent || "").trim()));
    const consultaTabsVisible = visibleNodes.some((node) => node.matches(tabsSelector));
    const stage = loginRequired ? "login-required" : captchaVisible ? "captcha-required" : promptVisible ? "prompt-required" : ready ? "ready" : consultaMenuVisible || location.pathname === "/indexN.php" ? "guest-shell" : "unknown";
    return { stage, readyState: document.readyState, ready, loginRequired, captchaVisible, promptVisible, guestEntryVisible, consultaMenuVisible, consultaTabsVisible, fields };
  }, {
    fieldsSelector: CONSULTA_FIELD_SELECTOR,
    guestSelector: OJV.accesoConsulta,
    captchaSelector: `${OJV.captchaImg}, ${OJV.captchaInput}, .g-recaptcha, .h-captcha, iframe[src*="/recaptcha/api2/bframe"], iframe[src*="/recaptcha/api2/anchor"], iframe[src*="hcaptcha.com"]`,
    tabsSelector: 'a[href="#BusJuridica"], a[href="#busRit"], a[href="#BusCausa"], a[href="#buscCausa"], a[href*="BusRol" i]',
  });
}

async function waitForObservedClickHandler(
  page: PlaywrightPage,
  locator: import("playwright").Locator,
  timeout: number
) {
  const inline = await locator.getAttribute("onclick");
  if (!inline) return;
  // Read only direct function calls observed on this control. Never invoke them.
  const names = [...inline.matchAll(/(?:^|;)\s*(?:return\s+)?(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1]).filter((name) => !["if", "for", "while", "switch", "function"].includes(name));
  if (!names.length) return;
  await page.waitForFunction((observed) => observed.every((name) =>
    typeof (window as unknown as Record<string, unknown>)[name] === "function"
  ), names, { timeout });
}

async function waitForConsultaEntryState(
  page: PlaywrightPage,
  timeout: number,
  accept: (state: ConsultaFormState) => boolean,
  signal?: AbortSignal
) {
  const deadline = Date.now() + timeout;
  do {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const state = await readConsultaFormState(page).catch(() => null);
    if (state && accept(state)) return state;
    await delay(100);
  } while (Date.now() < deadline);
  return readConsultaFormState(page);
}

function assertManualConsultaState(state: ConsultaFormState) {
  if (state.loginRequired || state.captchaVisible || state.promptVisible) {
    throw new PjudScrapeError(`La entrada OJV requiere intervención manual (${state.stage}). No se aceptaron avisos, no se resolvió CAPTCHA y no se inició una búsqueda de causas.`);
  }
}

/** Follow visible controls only. Manual mode leaves all prompts and CAPTCHA untouched. */
export async function enterConsultaCausas(
  page: PlaywrightPage,
  opts: { formTimeoutMs?: number; signal?: AbortSignal; mode?: "automatic" | "manual" } = {}
) {
  const timeout = opts.formTimeoutMs ?? 20_000;
  const manual = opts.mode === "manual";
  const prepare = async () => {
    if (manual) assertManualConsultaState(await readConsultaFormState(page));
    else {
      await closeSweetAlerts(page);
      await closeBootstrapModals(page);
    }
  };
  await prepare();

  if (!(await readConsultaFormState(page)).ready) {
    const acceso = page.locator(OJV.accesoConsulta).filter({ visible: true }).first();
    if (await acceso.count()) {
      try {
        await waitForObservedClickHandler(page, acceso, timeout);
        await acceso.click({ timeout: 15_000 });
        await waitForConsultaEntryState(page, timeout, (state) => state.ready || state.consultaMenuVisible || state.loginRequired || state.captchaVisible || state.promptVisible, opts.signal);
      } catch {
        throw new PjudScrapeError("No se pudo completar el acceso invitado a OJV. No se inició una búsqueda de causas.");
      }
      await prepare();
    }
    if (!(await readConsultaFormState(page)).ready) {
      const menu = page.getByRole("link", { name: /^Consulta Unificada$/i })
        .filter({ visible: true }).first();
      try {
        await menu.waitFor({ state: "visible", timeout });
        await waitForObservedClickHandler(page, menu, timeout);
        await menu.click({ timeout: 15_000 });
      } catch {
        throw new PjudScrapeError("No se encontró o no se pudo abrir el acceso visible a Consulta Unificada en OJV. No se inició una búsqueda de causas.");
      }
    }
  }
  await prepare();
  if (!manual) await maybeSolveCaptchaOnPage(page, opts.signal);
  const state = await waitForConsultaEntryState(page, timeout, (current) => current.ready || (manual && (current.loginRequired || current.captchaVisible || current.promptVisible)), opts.signal);
  if (manual) assertManualConsultaState(state);
  if (!state.ready) {
    if (state.stage === "guest-shell") {
      throw new PjudScrapeError("OJV abrió Consulta Unificada pero no mostró el formulario de búsqueda: el portal quedó en el menú sin campos de consulta. Reintente desde la OJV o pruebe más tarde. No se inició una búsqueda de causas.");
    }
    throw new PjudScrapeError(`OJV abrió Consulta Unificada pero no mostró el formulario de búsqueda (estado: ${state.stage}; documento: ${state.readyState}). El portal puede requerir una validación o haber cambiado su estructura. No se inició una búsqueda de causas.`);
  }
}

async function waitConsultaLoader(page: PlaywrightPage) {
  await page
    .waitForFunction(
      () => {
        const loaders = document.querySelectorAll(
          "#loadPreJuridica, #loadPreCausa, .loadingConsulta"
        );
        if (!loaders.length) return true;
        return [...loaders].every((l) => (l as HTMLElement).innerHTML.trim() === "");
      },
      undefined,
      { timeout: 60_000 }
    )
    .catch(() => { throw new PjudScrapeError("La consulta OJV no terminó de cargar. No se usarán resultados anteriores."); });
}

async function selectCompetencia(
  page: PlaywrightPage,
  value: OjvCompetenciaValue
) {
  const sel = page.locator(OJV.competencia).filter({ visible: true }).first();
  if ((await sel.count()) === 0) throw new PjudScrapeError("No está disponible el selector de competencia OJV.");
  await sel.selectOption(value);
  await delay(900);
}

async function readTribunalSelectOptions(
  page: PlaywrightPage,
  selector: string,
  waitForOptions = true
) {
  if (waitForOptions) await page
    .waitForFunction(
      (sel) => {
        const s = [...document.querySelectorAll(sel)].find((node) => (node as HTMLElement).getBoundingClientRect().height > 0);
        return Boolean(s && s.querySelectorAll("option").length > 1);
      },
      selector,
      { timeout: 15_000 }
    )
    .catch(() => undefined);
  // OJV a veces rellena el select en 2 oleadas AJAX
  if (waitForOptions) await delay(500);
  return page.locator(selector).filter({ visible: true }).first().locator("option").evaluateAll((arr) =>
    arr.map((o) => ({
      value: (o as HTMLOptionElement).value,
      label: (o.textContent || "").trim(),
    }))
  );
}

export async function selectTribunalOrCorte(page: PlaywrightPage, tribunal: string) {
  const competencia = inferCompetenciaFromTribunal(tribunal);
  await selectCompetencia(page, competencia);

  if (competencia === "1") {
    // Corte Suprema: normalmente sin tribunal de 1ª instancia.
    return;
  }

  if (competencia === "2") {
    const corte = page.locator(OJV.corte).filter({ visible: true }).first();
    await corte.waitFor({ state: "visible", timeout: 12_000 });
    const options = await readTribunalSelectOptions(page, OJV.corte);
    const match = pickBestTribunalOption(options, tribunal);
    if (!match) throw new PjudScrapeError(`No se pudo identificar una única corte para «${tribunal}».`);
    await corte.selectOption(match.value);
    return;
  }

  if (["3", "4", "5", "6"].includes(competencia)) {
    // Prefer visible select in active tab (ROL vs Jurídica).
    const trib = page
      .locator(OJV.tribunal).filter({ visible: true })
      .first();
    await trib.waitFor({ state: "visible", timeout: 12_000 });
    // The current RIT form intentionally has only Todos until a court is chosen.
    const needsCourt = await trib.getAttribute("id") === "conTribunal" &&
      await page.locator(OJV.corte).filter({ visible: true }).count() > 0;
    let options = await readTribunalSelectOptions(page, OJV.tribunal, !needsCourt);
    let match = pickBestTribunalOption(options, tribunal);
    if (!match) {
      const corte = page.locator(OJV.corte).filter({ visible: true }).first();
      if (await corte.count()) {
        const courts = await readTribunalSelectOptions(page, OJV.corte);
        const court = pickCorteForTribunal(courts, tribunal);
        if (!court) throw new PjudScrapeError(`No se pudo identificar una única corte para cargar el tribunal «${tribunal}». No se usará Todos.`);
        await corte.selectOption(court.value);
        options = await readTribunalSelectOptions(page, OJV.tribunal);
        match = pickBestTribunalOption(options, tribunal);
      }
    }
    if (match) {
      await trib.selectOption(match.value);
      return;
    }
    // No usar "Todos": puede abrir otra causa y persistir movimientos ajenos.
    throw new Error(
      `No se encontró el tribunal «${tribunal}» en la Oficina Judicial Virtual. Revise el nombre o sincronice con ClaveÚnica.`
    );
  }
}

/**
 * Click the active Consulta Unificada "Buscar".
 * `#btnConConsultaJur` often stays in the DOM on inactive Bootstrap tabs
 * (not visible) after switching to ROL/RIT — Playwright then times out.
 */
export async function clickBuscar(page: PlaywrightPage, responseTimeoutMs = 30_000) {
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);
  // Observe content before submitting: an unchanged old result must never be read
  // as the response to the new RIT/tribunal filters.
  await page.evaluate(() => {
    const state = window as typeof window & { lexopenConsulta?: { changed: boolean; observer: MutationObserver; currentRit: boolean; previousRows: Element[]; previousRowTexts: string[] } };
    state.lexopenConsulta?.observer.disconnect();
    const ritButton = document.querySelector("#btnConConsulta");
    const currentRit = Boolean(ritButton && ritButton.getBoundingClientRect().height > 0 && document.querySelector("#dtaTableDetalle"));
    const previousRows = [...document.querySelectorAll("#dtaTableDetalle tbody tr")];
    const results = "#dtaTableDetalle, #resultConsultaJuridica, #resultConsultaCausa, #resultConsultaRol, #verDetalleJuridica";
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => {
        const parent = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return Boolean(parent?.closest(results)) || [...mutation.addedNodes].some((node) =>
          node instanceof Element && (node.matches(results) || node.querySelector(results))
        );
      }) && state.lexopenConsulta) state.lexopenConsulta.changed = true;
    });
    state.lexopenConsulta = { changed: false, observer, currentRit, previousRows, previousRowTexts: previousRows.map(row => row.textContent || "") };
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  });

  const viaDom = await page
    .evaluate(() => {
      const visible = (el: Element) => {
        const h = el as HTMLElement;
        const style = window.getComputedStyle(h);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return false;
        }
        const r = h.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const labelOf = (el: Element) =>
        (
          (el.textContent || "") +
          " " +
          ((el as HTMLInputElement).value || "")
        ).trim();
      const active =
        document.querySelector(".tab-pane.active, .tab-content > .active") ||
        document.body;
      const tryClick = (root: ParentNode) => {
        const nodes = [
          ...root.querySelectorAll<HTMLElement>(
            "#btnConConsulta, #btnConConsultaJur, #btnConConsultaCausa, #btnConConsultaRol, #btnBuscar, button.btn-primary, button[type='submit'], input[type='submit']"
          ),
        ];
        for (const el of nodes) {
          const label = labelOf(el);
          const id = el.id || "";
          const isBuscar =
            /btnConConsulta|btnBuscar/i.test(id) || /^buscar$/i.test(label);
          if (!isBuscar || !visible(el) || (el as HTMLButtonElement).disabled) continue;
          el.click();
          return id || label || "buscar";
        }
        return null;
      };
      return tryClick(active) || tryClick(document);
    })
    .catch(() => null);

  if (!viaDom) {
    const roleBtn = page.getByRole("button", { name: /^Buscar$/i }).first();
    if (await roleBtn.isVisible().catch(() => false)) {
      await roleBtn.click({ timeout: 10_000 });
    } else {
      const any = page.locator(OJV.btnBuscarAny).filter({ visible: true }).first();
      if ((await any.count()) > 0) {
        await any.scrollIntoViewIfNeeded().catch(() => undefined);
        await any.click({ timeout: 10_000 });
      } else {
        throw new PjudScrapeError("No se encontró un botón Buscar visible en la consulta OJV.");
      }
    }
  }

  try {
    await page.waitForFunction(() => {
      const state = (window as typeof window & { lexopenConsulta?: { changed: boolean; currentRit: boolean; previousRows: Element[]; previousRowTexts: string[] } }).lexopenConsulta;
      if (!state?.changed) return false;
      if (!state.currentRit) return true;
      const button = document.querySelector("#btnConConsulta") as HTMLButtonElement | null;
      if (!button || button.disabled || button.getAttribute("aria-busy") === "true") return false;
      const table = document.querySelector("#dtaTableDetalle");
      if (!table || !table.getBoundingClientRect().height || table.getAttribute("aria-busy") === "true") return false;
      const processing = document.querySelector("#dtaTableDetalle_processing");
      if (processing && processing.getBoundingClientRect().height > 0 && getComputedStyle(processing).display !== "none" && getComputedStyle(processing).visibility !== "hidden") return false;
      return [...table.querySelectorAll("tbody tr")].some((row) => {
        if (!row.getBoundingClientRect().height) return false;
        const cells = [...row.querySelectorAll("td")];
        const text = (row.textContent || "").replace(/\s+/g, " ").trim();
        if (/\b(?:cargando|procesando|loading|processing)\b/i.test(text)) return false;
        const data = cells.length >= 5 && Boolean(cells[1].textContent?.trim() && cells[4].textContent?.trim());
        const empty = cells.length === 1 && (/no se (?:han encontrado|encontraron) (?:causas|resultados|registros)|no hay (?:causas|resultados|registros)|sin (?:causas|resultados|registros)|ning[uú]n dato disponible/i.test(text) || cells[0].classList.contains("dataTables_empty"));
        if (!data && !empty) return false;
        const previous = state.previousRows.indexOf(row);
        return previous < 0 || state.previousRowTexts[previous] !== (row.textContent || "");
      });
    }, undefined, { timeout: responseTimeoutMs });
    await waitConsultaLoader(page);
  } catch {
    throw new PjudScrapeError("OJV no devolvió resultados nuevos para esta búsqueda. No se usarán resultados anteriores.");
  } finally {
    await page.evaluate(() => {
      const state = window as typeof window & { lexopenConsulta?: { observer: MutationObserver } };
      state.lexopenConsulta?.observer.disconnect();
      delete state.lexopenConsulta;
    }).catch(() => undefined);
  }
}

export async function openExactCauseModal(
  page: PlaywrightPage,
  causa: { rit: string; tribunal: string },
  selector = "#dtaTableDetalle tr, #verDetalleJuridica tr, #resultConsultaJuridica tr",
  freshScope?: Locator
): Promise<string | null> {
  const rows = (freshScope ?? page).locator(selector);
  const snapshots = await rows.evaluateAll((nodes, requireFresh) => nodes.map((node) => {
    const el = node as HTMLElement;
    const visible = el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden" &&
      (el.tagName === "TR" || !el.querySelector("tr, .card, .list-group-item"));
    const fresh = !requireFresh || Boolean((window as ManualMisCausasPageState).lexopenManualMisCausasFresh?.has(node));
    const cells = [...node.children].filter((child) => /^(TD|TH)$/.test(child.tagName));
    return {
      eligible: visible && fresh,
      cells: (cells.length ? cells : [...node.children]).map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim()),
    };
  }), Boolean(freshScope));
  const matches = snapshots.map((row, index) => ({ ...row, index }))
    .filter((row) => row.eligible && causeRowMatches(row.cells, causa));
  if (matches.length > 1) {
    throw new PjudScrapeError(`OJV devolvió varias filas para ${causa.rit} y «${causa.tribunal}». No se pudo confirmar un expediente único.`);
  }
  if (matches.length === 0) return null;
  await closeBootstrapModals(page);
  const existingModal = page.locator(`:is(${OJV.modal}):visible`).first();
  if (await existingModal.count()) {
    await existingModal.waitFor({ state: "hidden", timeout: 5_000 });
  }
  const staleDetails = (await page.locator(".modal").evaluateAll((nodes) => nodes.map((node) => node.innerHTML)))
    .filter((html) => parseMovimientosFromHtml(html).length > 0 || hasExplicitEmptyHistory(html));
  const row = rows.nth(matches[0].index);
  const clicked = await row.evaluate((node, expectedCells) => {
    if (expectedCells) {
      if (!(window as ManualMisCausasPageState).lexopenManualMisCausasFresh?.has(node)) return false;
      const cells = [...node.children].filter((child) => /^(TD|TH)$/.test(child.tagName));
      const texts = (cells.length ? cells : [...node.children]).map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim());
      if (texts.length !== expectedCells.length || texts.some((text, index) => text !== expectedCells[index])) return false;
    }
    const icon = node.querySelector('img[src*="lupa" i], .glyphicon-search, .fa-search');
    const target = icon?.closest("a, button") || node.querySelector('a[title*="detalle" i], a[title*="ver" i], td a[onclick], td a, a[onclick], button');
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, freshScope ? matches[0].cells : undefined);
  if (!clicked) throw new PjudScrapeError(`La fila exacta de ${causa.rit} no tiene un enlace de detalle reconocible.`);
  await page.locator(`:is(${OJV.modal}):visible`).first().waitFor({ state: "visible", timeout: 20_000 });
  if (staleDetails.length) {
    await page.waitForFunction((previous) => [...document.querySelectorAll(".modal")].some((node) =>
      (node as HTMLElement).getBoundingClientRect().height > 0 && !previous.includes(node.innerHTML)
    ), staleDetails, { timeout: 20_000 });
  }
  const history = await findModalHistoryTab(page, "history");
  if (history) await history.tab.click();
  // The all-cuaderno reader records a failed initial cuaderno and can continue
  // with the others. A legacy detail without a selector still needs this guard.
  if (!(await cuadernoSelector(page))?.options.length) {
    await waitForModalHistoryPanel(page, { label: "Historia", panelId: history?.panelId });
  }
  return pickTribunalFromTexts(matches[0].cells);
}

export async function modalInnerHtml(page: PlaywrightPage) {
  const modal = await visibleCauseDetailModal(page);
  return (await modal.count()) ? modal.innerHTML() : "";
}

/** Read the selected tab only; auxiliary tables outside it are another scope. */
export async function modalActivePaneHtml(page: PlaywrightPage) {
  const modal = await visibleCauseDetailModal(page);
  if (!(await modal.count())) return "";
  const panes = modal.locator(".tab-pane");
  if (!(await panes.count())) return modal.innerHTML();
  const active = modal.locator(".tab-pane.active").filter({ visible: true });
  if (!(await active.count())) throw new PjudScrapeError("El detalle OJV tiene pestañas, pero no muestra una pestaña activa de historial.");
  return active.last().innerHTML();
}

async function visibleCauseDetailModal(page: PlaywrightPage) {
  const modals = page.locator(OJV.modal).filter({ visible: true });
  const details = modals.and(page.locator('[id^="modalDetalle"]'));
  const count = await details.count();
  if (count > 1) throw new PjudScrapeError("OJV mostró varios detalles de causa simultáneos; no se seleccionará uno sin confirmar su identidad.");
  return count === 1 ? details.first() : modals.first();
}

/** Document links can contain 'anexo' too; only existing tab destinations qualify. */
async function findModalHistoryTab(page: PlaywrightPage, kind: "history" | "notifications" | "writings") {
  const modal = await visibleCauseDetailModal(page);
  const selector = kind === "history" ? OJV.historiaTab : kind === "notifications" ? OJV.receptorTab : OJV.escritosTab;
  const tabs = modal.locator(selector).filter({ visible: true });
  const resolution = await tabs.evaluateAll((nodes, options) => {
    const candidates = nodes.map((node, index) => {
      const owner = node.closest(".modal");
      if (!owner || (options.modalId && owner.id !== options.modalId)) return null;
      const label = (node.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const semantic = options.kind === "history" ? /^(?:historia|historial|movimientos)(?:\b|_)/i : options.kind === "notifications" ? /^(?:notificaciones?|receptor)(?:\b|_)/i : /^(?:escritos?)(?:\b|_)/i;
      const navigation = Boolean(node.closest('.nav-tabs, .nav-pills, [role="tablist"]') || node.getAttribute("role") === "tab" || /^(?:tab|pill)$/.test(node.getAttribute("data-toggle") || node.getAttribute("data-bs-toggle") || ""));
      let panelId: string | undefined;
      for (const attribute of ["data-bs-target", "data-target", "href"]) {
        const value = node.getAttribute(attribute) || "";
        if (/^#[^\s#]+$/.test(value)) { panelId = value.slice(1); break; }
      }
      const target = panelId ? [...owner.querySelectorAll("[id]")].find((element) => element.id === panelId) : undefined;
      const semanticId = Boolean(panelId && (options.kind === "history" ? /^(?:historia|historial|movimientos)/i : options.kind === "notifications" ? /^(?:notific|receptor)/i : /^escrito/i).test(panelId));
      const meaningful = semantic.test(label) || semanticId;
      const anexoTab = options.kind === "history" && navigation && /^anexo/i.test(panelId || "");
      const panes = owner.querySelectorAll(".tab-pane").length;
      const validTarget = target && (panes ? target.classList.contains("tab-pane") : target.matches("table") || Boolean(target.querySelector("table")));
      return { index, panelId, valid: Boolean(validTarget && (meaningful || anexoTab)), invalidNavigation: navigation && meaningful && !validTarget, score: (navigation ? 100 : 0) + (semanticId ? 20 : 0) + (semantic.test(label) ? 10 : 0) };
    }).filter((candidate) => candidate !== null);
    return { candidates: candidates.filter((candidate) => candidate.valid).sort((a, b) => b.score - a.score), invalidNavigation: candidates.some((candidate) => candidate.invalidNavigation) };
  }, { kind, modalId: await modal.getAttribute("id") });
  const selected = resolution.candidates[0];
  if (selected?.panelId) return { tab: tabs.nth(selected.index), panelId: selected.panelId };
  if (resolution.invalidNavigation || (kind === "history" && (await tabs.count()) && (await modal.locator(".tab-pane").count()))) {
    throw new PjudScrapeError("El detalle OJV no mostró una pestaña de historial con destino existente dentro de la causa. No se abrirán enlaces de documentos como pestañas.");
  }
  return undefined;
}

/** Opt-in structural diagnostics. Never return case cells, URLs, or raw HTML. */
export async function readModalPanelDebugDiagnostics(page: PlaywrightPage, requestedPanelId?: string) {
  if (process.env.LEXOPEN_PJUD_LIVE_VALIDATION !== "1" || process.env.PJUD_PANEL_DEBUG !== "1") return undefined;
  const modal = await visibleCauseDetailModal(page);
  const visibleModalCount = await page.locator(OJV.modal).filter({ visible: true }).count();
  if (!visibleModalCount) return { visibleModalCount: 0 };
  return modal.evaluate((node, requested) => {
    const safe = {
      id(value: string | undefined) {
        return value && /^(?:modalDetalle|historia|notificaciones?|escritos?|receptor|anexo)[A-Za-z_-]{0,60}$/i.test(value) ? value : value ? "other" : null;
      },
      visible(element: Element) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        for (let current: Element | null = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return true;
      },
      date(value: string) {
        const raw = value.replace(/\s+/g, " ").trim();
        const numeric = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:\s*\(\d{1,2}\/\d{1,2}\/\d{4}\))?$/);
        const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
        const long = raw.toLowerCase().match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const year = iso ? Number(iso[1]) : numeric ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : long ? Number(long[3]) : NaN;
        const month = iso ? Number(iso[2]) : numeric ? Number(numeric[2]) : long ? months.indexOf(long[2]) + 1 : NaN;
        const day = Number(iso ? iso[3] : numeric ? numeric[1] : long?.[1]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return year >= 100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      },
      header(value: string) {
        const label = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
        const allowed = ["folio", "doc", "documento", "anexo", "etapa", "tramite", "desc tramite", "descripcion tramite", "descripcion del tramite", "fecha", "fec tramite", "fecha tramite", "fecha de tramite", "fecha ingreso", "fecha de ingreso", "fecha resolucion", "fecha de resolucion", "tipo escrito", "tipo notificacion", "solicitante", "foja", "georref", "cuaderno", "actuacion", "resolucion", "descripcion"];
        return allowed.includes(label) ? label : "other";
      },
      excluded(elements: Element[]) {
        return {
          hidden: elements.filter((element) => element.hasAttribute("hidden")).length,
          ariaHidden: elements.filter((element) => element.getAttribute("aria-hidden") === "true").length,
          displayNone: elements.filter((element) => /display\s*:\s*none/i.test(element.getAttribute("style") || "")).length,
          visibilityHidden: elements.filter((element) => /visibility\s*:\s*hidden/i.test(element.getAttribute("style") || "")).length,
          inactivePane: elements.filter((element) => element.classList.contains("tab-pane") && !element.classList.contains("active")).length,
        };
      },
    };
    const panes = [...node.querySelectorAll(".tab-pane")];
    const active = panes.filter((pane) => pane.classList.contains("active") && safe.visible(pane)).at(-1);
    const target = requested ? [...node.querySelectorAll("[id]")].find((element) => element.id === requested) : undefined;
    const jqueryValue = Number((window as typeof window & { jQuery?: { active?: number } }).jQuery?.active || 0);
    const jqueryActive = Number.isFinite(jqueryValue) ? Math.max(0, Math.min(jqueryValue, 1_000_000)) : null;
    const loadingText = /^(?:cargando|procesando|espere(?: un momento)?|loading|processing)(?:[.\s…]*)$/i;
    const scopes = panes.length ? panes.slice(0, 8) : [target || node];
    const panels = scopes.map((scope) => {
      const rows = [...scope.querySelectorAll("tr")].filter((row) => row.querySelector("td") && !row.closest("table.table-titulos"));
      const visibleRows = rows.filter((row) => safe.visible(row));
      const loadingIndicators = [...scope.querySelectorAll('[aria-busy="true"], .dataTables_processing, .loadingConsulta, [id^="loadPre"], .spinner, .spinner-border, .fa-spinner')].filter((element) => safe.visible(element)).length;
      return {
        id: safe.id(scope.id),
        active: scope.classList.contains("active"),
        visible: safe.visible(scope),
        tableCount: scope.querySelectorAll("table:not(.table-titulos)").length,
        headerLabels: [...scope.querySelectorAll("th")].filter((cell) => !cell.closest("table.table-titulos")).slice(0, 24).map((cell) => safe.header(cell.textContent || "")),
        rowCount: rows.length,
        visibleRowCount: visibleRows.length,
        rowsWithValidDate: visibleRows.filter((row) => [...row.querySelectorAll("td")].some((cell) => safe.date(cell.textContent || ""))).length,
        ariaBusy: scope.getAttribute("aria-busy") === "true",
        loadingIndicators,
        loadingRows: visibleRows.filter((row) => loadingText.test((row.textContent || "").trim())).length,
      };
    });
    const scope = active || target || node;
    const scopeElements = [scope, ...scope.querySelectorAll("*")];
    const scopeTables = [...scope.querySelectorAll("table")];
    if (scope.matches("table")) scopeTables.unshift(scope as HTMLTableElement);
    const titleTables = scopeTables.filter((table) => table.classList.contains("table-titulos"));
    const clone = scope.cloneNode(true) as Element;
    clone.querySelectorAll("table.table-titulos").forEach((table) => table.remove());
    const visibleTableText = document.createElement("div");
    for (const table of scopeTables.filter((table) => safe.visible(table) && !table.classList.contains("table-titulos"))) {
      const rebuilt = document.createElement("table");
      for (const row of [...table.querySelectorAll("tr")].filter((row) => row.closest("table") === table && safe.visible(row))) {
        const rebuiltRow = document.createElement("tr");
        for (const cell of [...row.children].filter((cell) => /^(?:TD|TH)$/.test(cell.tagName) && safe.visible(cell))) {
          const rebuiltCell = document.createElement(cell.tagName.toLowerCase());
          rebuiltCell.textContent = (cell as HTMLElement).innerText;
          rebuiltRow.append(rebuiltCell);
        }
        rebuilt.append(rebuiltRow);
      }
      visibleTableText.append(rebuilt);
    }
    return {
      visibleModalCount: 1,
      modalId: safe.id(node.id),
      modalVisible: safe.visible(node),
      requestedPanelId: safe.id(requested),
      requestedTargetPresent: Boolean(target),
      requestedTargetVisible: Boolean(target && safe.visible(target)),
      panelCount: panes.length,
      activePanelId: safe.id(active?.id),
      activeMatchesRequested: !requested || active?.id === requested,
      jqueryActive,
      panels,
      scopeExcludedAttributes: safe.excluded(scopeElements),
      tableExcludedAttributes: safe.excluded(scopeTables),
      rowExcludedAttributes: safe.excluded([...scope.querySelectorAll("tr")]),
      headerCellExcludedAttributes: safe.excluded([...scope.querySelectorAll("th")]),
      dataCellExcludedAttributes: safe.excluded([...scope.querySelectorAll("td")]),
      scopeRowCount: scope.querySelectorAll("tr").length,
      snapshotRowCount: clone.querySelectorAll("tr").length,
      removedTitleTableCount: titleTables.length,
      removedTitleTableRowCount: titleTables.reduce((count, table) => count + table.querySelectorAll("tr").length, 0),
      // Internal-only strings are consumed below and excluded from diagnostics.
      parserScopeHtml: scope.tagName === "TABLE" ? scope.outerHTML : scope.innerHTML,
      parserSnapshotHtml: clone.tagName === "TABLE" ? clone.outerHTML : clone.innerHTML,
      parserVisibleTableTextHtml: visibleTableText.innerHTML,
    };
  }, requestedPanelId).then(({ parserScopeHtml, parserSnapshotHtml, parserVisibleTableTextHtml, ...diagnostics }) => ({
    ...diagnostics,
    visibleModalCount,
    scopeParserCount: parseMovimientosFromHtml(parserScopeHtml).length,
    snapshotParserCount: parseMovimientosFromHtml(parserSnapshotHtml).length,
    snapshotExplicitEmpty: hasExplicitEmptyHistory(parserSnapshotHtml),
    visibleTableTextParserCount: parseMovimientosFromHtml(parserVisibleTableTextHtml).length,
  }));
}

/** A title table or loading placeholder is not a completed history response. */
export async function waitForModalHistoryPanel(
  page: PlaywrightPage,
  options: { label: string; panelId?: string; optional?: boolean; timeoutMs?: number; emptyIdleMs?: number }
): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let stableEmptyHtml = "";
  let stableEmptySince = 0;
  while (Date.now() < deadline) {
    const modal = await visibleCauseDetailModal(page);
    const snapshot = (await modal.count()) ? await modal.evaluate((node, panelId) => {
      const visibility = { has(element: Element) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        for (let current: Element | null = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return true;
      } };
      const panes = [...node.querySelectorAll(".tab-pane")];
      const active = panes.filter((pane) => pane.classList.contains("active") && visibility.has(pane)).at(-1);
      if (panes.length && (!active || (panelId && active.id !== panelId))) return null;
      const legacyTarget = panelId ? [...node.querySelectorAll("[id]")].find((element) => element.id === panelId && visibility.has(element)) : undefined;
      if (panelId && !panes.length && !legacyTarget) return null;
      const scope = active || legacyTarget || node;
      const loadingText = /^(?:cargando|procesando|espere(?: un momento)?|loading|processing)(?:[.\s…]*)$/i;
      const busy = scope.getAttribute("aria-busy") === "true" ||
        [...scope.querySelectorAll('[aria-busy="true"], .dataTables_processing, .loadingConsulta, [id^="loadPre"], .spinner, .spinner-border, .fa-spinner')]
          .some((element) => visibility.has(element)) ||
        [...scope.querySelectorAll("tr")].some((row) => visibility.has(row) && loadingText.test((row.textContent || "").trim())) ||
        Number((window as typeof window & { jQuery?: { active?: number } }).jQuery?.active || 0) > 0;
      if (busy) return null;
      const tables = [...scope.querySelectorAll("table")];
      if (scope.matches("table")) tables.unshift(scope as HTMLTableElement);
      const emptyOptionalTable = tables.some((table) => {
        if (table.classList.contains("table-titulos") || !visibility.has(table)) return false;
        const headers = [...table.querySelectorAll("th")].map((cell) => cell.textContent || "").join(" ")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (!/fecha|\bfec\b/.test(headers) || !/escrito|tramite|actuacion|resolucion|notific|tipo|solicitante|documento|\bdoc\b/.test(headers)) return false;
        const rows = [...table.querySelectorAll("tr")].filter((row) => visibility.has(row) && row.querySelector("td"));
        return rows.length === 0 || rows.every((row) => row.querySelectorAll("td").length === 1 &&
          /sin (?:movimientos|registros|notificaciones|escritos)|no (?:hay|existen|se (?:han encontrado|encontraron)) (?:movimientos|registros|notificaciones|escritos)|ning[uú]n dato disponible/i.test(row.textContent || ""));
      });
      const clone = scope.cloneNode(true) as Element;
      clone.querySelectorAll("table.table-titulos").forEach((table) => table.remove());
      return { html: clone.tagName === "TABLE" ? clone.outerHTML : clone.innerHTML, emptyOptionalTable };
    }, options.panelId) : null;
    if (snapshot?.html) {
      if (parseMovimientosFromHtml(snapshot.html).length || hasExplicitEmptyHistory(snapshot.html)) return snapshot.html;
      // Optional preloaded tables can have only their recognized header. Idle
      // means no rows recovered; it does not certify that the cause has none.
      if (options.optional && snapshot.emptyOptionalTable) {
        if (stableEmptyHtml !== snapshot.html) {
          stableEmptyHtml = snapshot.html;
          stableEmptySince = Date.now();
        } else if (Date.now() - stableEmptySince >= (options.emptyIdleMs ?? 1_000)) return snapshot.html;
      } else {
        stableEmptyHtml = "";
        stableEmptySince = 0;
      }
    } else {
      stableEmptyHtml = "";
      stableEmptySince = 0;
    }
    await delay(Math.min(100, Math.max(0, deadline - Date.now())));
  }
  const diagnostics = await readModalPanelDebugDiagnostics(page, options.panelId).catch(() => ({ diagnosticUnavailable: true }));
  throw new PjudScrapeError(`La pestaña ${options.label} del detalle OJV no terminó de mostrar un historial reconocible. No se crearán movimientos desde la cabecera ni desde el listado.${diagnostics ? ` Diagnóstico estructural: ${JSON.stringify(diagnostics)}` : ""}`);
}

/** Merge scrape rows by externalId; prefer receptor / pendiente flags. */
export function mergePjudMovimientos(
  base: PjudFetchedMovimiento[],
  extra: PjudFetchedMovimiento[]
) {
  const map = new Map<string, PjudFetchedMovimiento>();
  for (const m of omitLegacyScrapeAliases([...base, ...extra])) {
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
      documentoBytes: m.documentoBytes || prev.documentoBytes,
      documentoFilename: m.documentoFilename || prev.documentoFilename,
    });
  }
  return [...map.values()].sort(
    (a, b) => b.fecha.getTime() - a.fecha.getTime()
  );
}

async function activeHistoryHasUnreadPages(page: PlaywrightPage) {
  const modal = await visibleCauseDetailModal(page);
  return modal.evaluate(node => {
    const visible = { has(element: Element) {
      if (!element.getBoundingClientRect().height) return false;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      }
      return true;
    } };
    const active = [...node.querySelectorAll(".tab-pane.active")].filter(pane => visible.has(pane)).at(-1);
    const scope = active || node;
    return [...scope.querySelectorAll('a, button, [role="button"]')].some(control => {
      if (!visible.has(control) || control.closest('.disabled, [disabled], [aria-disabled="true"]')) return false;
      const inPager = control.closest('.dataTables_paginate, .dt-paging, .pagination, nav[aria-label*="pagin" i], [role="navigation"][aria-label*="pagin" i]');
      const rel = control.getAttribute("rel") || "";
      const labels = [control.getAttribute("aria-label") || "", control.textContent || ""].map(label => label.trim().replace(/\s+/g, " "));
      const direction = labels.some(label => /^(?:siguiente|anterior|next|previous|prev|›|»|‹|«|<|>)(?:\s+(?:p[aá]gina|page))?$/i.test(label)) ||
        control.matches('.next, .previous, .prev') || /^(next|prev)$/i.test(rel);
      return Boolean(direction && (inPager || /^(next|prev)$/i.test(rel)));
    });
  });
}

export async function scrapeModalTabs(
  page: PlaywrightPage,
  options: { panelTimeoutMs?: number; emptyIdleMs?: number; cuaderno?: string; recoverPartial?: boolean; onIncomplete?: (panel: string) => void; deadlineAt?: number; limit?: number } = {}
): Promise<PjudFetchedMovimiento[]> {
  const timeout = () => Math.max(1, Math.min(options.panelTimeoutMs ?? 30_000, (options.deadlineAt ?? Infinity) - Date.now()));
  const parse = (html: string, panel: string) => {
    let incomplete = false;
    const rows = parseMovimientosFromHtml(html, { cuaderno: options.cuaderno, limit: options.limit, onIncompleteRow: () => { incomplete = true; } });
    if (incomplete) options.onIncomplete?.(`${panel}: filas sin fecha o texto reconocible`);
    return rows;
  };
  const checkPaging = async (panel: string) => {
    if (options.onIncomplete && await activeHistoryHasUnreadPages(page)) options.onIncomplete(`${panel}: quedan páginas por leer`);
  };
  const history = await findModalHistoryTab(page, "history");
  if (history) await history.tab.click();
  const historyHtml = await waitForModalHistoryPanel(page, { label: "Historia", panelId: history?.panelId, timeoutMs: timeout() });
  await checkPaging("Historia");
  let movimientos = parse(historyHtml, "Historia");

  try {
    const receptor = await findModalHistoryTab(page, "notifications");
    if (receptor) {
      await receptor.tab.click();
      const receptorHtml = await waitForModalHistoryPanel(page, { label: "Notificaciones", panelId: receptor.panelId, optional: true, timeoutMs: timeout(), emptyIdleMs: options.emptyIdleMs });
      await checkPaging("Notificaciones");
      const receptorMovs = parse(receptorHtml, "Notificaciones").map((m) => ({
      ...m,
      esReceptor: true,
      relevante: true,
      tipo: m.tipo === "otro" ? "notificacion" : m.tipo,
      }));
      movimientos = mergePjudMovimientos(movimientos, receptorMovs);
    }
  } catch (error) {
    if (!options.recoverPartial) throw error;
    options.onIncomplete?.("Notificaciones");
  }

  try {
    const escritos = await findModalHistoryTab(page, "writings");
    if (escritos) {
      await escritos.tab.click();
      const escritosHtml = await waitForModalHistoryPanel(page, { label: "Escritos", panelId: escritos.panelId, optional: true, timeoutMs: timeout(), emptyIdleMs: options.emptyIdleMs });
      await checkPaging("Escritos");
      const escritoMovs = parse(escritosHtml, "Escritos").map((m) => {
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
  } catch (error) {
    if (!options.recoverPartial) throw error;
    options.onIncomplete?.("Escritos");
  }

  return movimientos;
}

type CuadernoOption = { key: string; label: string; cuaderno: string; value: string };
const unsettledCuadernoSelections = new WeakMap<PlaywrightPage, string>();

/** Public identity comes from the displayed cuaderno, never its session JWT. */
export function pjudCuadernoIdentity(raw: string) {
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label || label.length > 255 || /^[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/.test(label)) {
    throw new PjudScrapeError("OJV no mostró una etiqueta de cuaderno reconocible.");
  }
  const formal = /^(\d+(?:\.\d+){0,5})\s*[-–—]\s*(.+)$/.exec(label);
  const code = formal?.[1].split(".").map(part => part.replace(/^0+(?=\d)/, "")).join(".");
  const key = code ? `cuaderno:${code}` : `cuaderno:label:${createHash("sha1").update(normalizePjudCuaderno(label) || label).digest("hex").slice(0, 24)}`;
  // Principal was already stored under this canonical name by older readers.
  // Other formal labels retain their subcuaderno number to avoid name collisions.
  const cuaderno = formal && /^(?:1|1\.0)$/.test(code!) && /^principal$/i.test(formal[2]) ? "Principal" : label;
  return { key, label, cuaderno };
}

async function cuadernoSelector(page: PlaywrightPage) {
  const modal = await visibleCauseDetailModal(page);
  const selects = modal.locator("select").filter({ visible: true });
  const candidates = await selects.evaluateAll(nodes => nodes.map((node, index) => {
    const select = node as HTMLSelectElement;
    const label = select.id ? [...select.ownerDocument.querySelectorAll("label")].find(item => item.htmlFor === select.id)?.textContent || "" : "";
    if (!/cuaderno/i.test(`${select.id} ${select.name} ${label} ${select.getAttribute("aria-label") || ""}`)) return null;
    const options = [...select.options].filter(option => !option.disabled && Boolean(option.value.trim()) &&
      !/^(?:seleccione(?:\s+(?:un|el))?(?:\s+cuaderno)?[.\s…]*|todos?(?:\s+los\s+cuadernos)?|--+|cuaderno)$/i.test((option.textContent || "").trim()));
    return { index, total: options.length, selectedLabel: select.selectedOptions[0]?.textContent || "", options: options.slice(0, 100).map(option => ({ label: option.textContent || "", value: option.value })) };
  }).filter(candidate => candidate !== null));
  if (candidates.length > 1) throw new PjudScrapeError("OJV mostró varios selectores de cuaderno; no se atribuirán movimientos a una selección ambigua.");
  const candidate = candidates[0];
  if (!candidate) return undefined;
  const options: CuadernoOption[] = candidate.options.map(option => ({ ...pjudCuadernoIdentity(option.label), value: option.value }));
  if (new Set(options.map(option => option.key)).size !== options.length) {
    throw new PjudScrapeError("OJV mostró cuadernos sin una identificación distinta. No se mezclarán sus historiales.");
  }
  return { locator: selects.nth(candidate.index), total: candidate.total, selectedLabel: candidate.selectedLabel.trim().replace(/\s+/g, " "), options };
}

export async function changeCuaderno(
  page: PlaywrightPage,
  target: CuadernoOption,
  options: { timeoutMs: number; signal?: AbortSignal; allowPrompts?: boolean }
) {
  await assertPjudPromptPolicy(page, options.allowPrompts === false);
  const current = await cuadernoSelector(page);
  const selected = current?.options.find(option => option.key === target.key);
  if (!current || !selected) throw new PjudScrapeError("El cuaderno dejó de estar disponible en el selector OJV.");
  if (current.selectedLabel === selected.label && unsettledCuadernoSelections.get(page) !== selected.key) return selected;
  const history = await findModalHistoryTab(page, "history");
  if (history) await history.tab.click();
  const modal = await visibleCauseDetailModal(page);
  await modal.evaluate((node, panelId) => {
    type State = { root: Element; rows: Element[]; texts: string[]; observer: MutationObserver; dataChanged: boolean; panelId?: string };
    const host = window as typeof window & { lexopenCuadernoTransition?: State };
    host.lexopenCuadernoTransition?.observer.disconnect();
    const scope = panelId ? [...node.querySelectorAll("[id]")].find(item => item.id === panelId) || node : node;
    const terminalRow = { has(row: Element) {
      if (row.closest("table.table-titulos")) return false;
      const cells = [...row.querySelectorAll("td")];
      return cells.length >= 2 && cells.some(cell => /^(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}(?:\s*\(\d{1,2}\/\d{1,2}\/\d{4}\))?|\d{4}-\d{2}-\d{2}(?:T[^\s]+)?|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})$/i.test((cell.textContent || "").trim())) ||
        cells.length === 1 && /sin (?:movimientos|registros)|no (?:hay|existen|se (?:han encontrado|encontraron)) (?:movimientos|registros)|ning[uú]n dato disponible/i.test(row.textContent || "");
    } };
    const rows = [...scope.querySelectorAll("tr")].filter(row => terminalRow.has(row));
    const state: State = { root: scope, rows, texts: rows.map(row => row.textContent || ""), observer: null as unknown as MutationObserver, dataChanged: false, panelId };
    state.observer = new MutationObserver(records => {
      if (records.some(record => {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        const row = element?.closest("tr");
        if (!row || !terminalRow.has(row)) return false;
        const changedNodes = [...record.addedNodes, ...record.removedNodes];
        const loadingOnly = changedNodes.length > 0 && changedNodes.every(item => item instanceof Element
          ? item.matches('.spinner, .spinner-border, .fa-spinner, [aria-busy="true"], .dataTables_processing, .loadingConsulta')
          : /^(?:cargando|procesando|loading|processing)[.\s…]*$/i.test(item.textContent || ""));
        return !loadingOnly;
      })) state.dataChanged = true;
    });
    state.observer.observe(scope, { childList: true, subtree: true, characterData: true });
    host.lexopenCuadernoTransition = state;
  }, history?.panelId);
  let matchingRequest = false;
  let matchingResponse = false;
  let matchingFailure = false;
  const response = (item: import("playwright").Response) => {
    const request = item.request();
    let payload = `${request.url()} ${request.postData() || ""}`;
    try { payload = decodeURIComponent(payload); } catch { /* Compare the original encoded payload. */ }
    let official = false;
    try { const host = new URL(request.url()).hostname; official = host === "oficinajudicialvirtual.pjud.cl" || host === "ojv.pjud.cl"; } catch { /* Ignore non-HTTP resources. */ }
    if (!official || !payload.includes(selected.value)) return;
    matchingRequest = true;
    if (!item.ok()) matchingFailure = true;
    void item.finished().then(error => {
      if (error) matchingFailure = true;
      else matchingResponse = item.ok();
    }).catch(() => { matchingFailure = true; });
  };
  page.on("response", response);
  try {
    // Resolve the option afresh: OJV replaces all JWT values after each change.
    unsettledCuadernoSelections.set(page, selected.key);
    await current.locator.selectOption({ value: selected.value });
    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await assertPjudPromptPolicy(page, options.allowPrompts === false);
      if (matchingFailure) throw new PjudScrapeError("OJV no completó la respuesta del cuaderno seleccionado.");
      const refreshed = await cuadernoSelector(page);
      if (refreshed?.selectedLabel === selected.label) {
        const detail = await visibleCauseDetailModal(page);
        const fresh = await detail.evaluate(node => {
          const state = (window as typeof window & { lexopenCuadernoTransition?: { root: Element; rows: Element[]; texts: string[]; dataChanged: boolean; panelId?: string } }).lexopenCuadernoTransition;
          if (!state) return { replaced: false, changed: false };
          const scope = state.panelId ? [...node.querySelectorAll("[id]")].find(item => item.id === state.panelId) : node;
          if (!scope) return { replaced: false, changed: state.dataChanged };
          const rows = [...scope.querySelectorAll("tr")].filter(row => {
            if (row.closest("table.table-titulos")) return false;
            const cells = [...row.querySelectorAll("td")];
            return cells.length >= 2 && cells.some(cell => /^(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}(?:\s*\(\d{1,2}\/\d{1,2}\/\d{4}\))?|\d{4}-\d{2}-\d{2}(?:T[^\s]+)?|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})$/i.test((cell.textContent || "").trim())) ||
              cells.length === 1 && /sin (?:movimientos|registros)|no (?:hay|existen|se (?:han encontrado|encontraron)) (?:movimientos|registros)|ning[uú]n dato disponible/i.test(row.textContent || "");
          });
          return { replaced: rows.some(row => !state.rows.includes(row)), changed: state.dataChanged || rows.some(row => {
            const index = state.rows.indexOf(row);
            return index >= 0 && state.texts[index] !== (row.textContent || "");
          }) };
        });
        if ((!matchingRequest || matchingResponse) && (fresh.replaced || (matchingResponse && fresh.changed))) {
          unsettledCuadernoSelections.delete(page);
          return selected;
        }
      }
      await delay(Math.min(100, Math.max(0, deadline - Date.now())));
    }
    throw new PjudScrapeError("OJV no devolvió un historial nuevo para el cuaderno seleccionado. No se usarán las filas del cuaderno anterior.");
  } finally {
    page.off("response", response);
    await page.evaluate(() => {
      const host = window as typeof window & { lexopenCuadernoTransition?: { observer: MutationObserver } };
      host.lexopenCuadernoTransition?.observer.disconnect();
      delete host.lexopenCuadernoTransition;
    }).catch(() => undefined);
  }
}

/** Read every listed cuaderno in its own scope, retaining explicit partial results. */
export async function scrapeAllCuadernos(
  page: PlaywrightPage,
  options: { panelTimeoutMs?: number; transitionTimeoutMs?: number; totalTimeoutMs?: number; emptyIdleMs?: number; allowPrompts?: boolean; signal?: AbortSignal; downloadDocuments?: boolean; excludeDocumentExternalIds?: readonly string[]; documentExternalIds?: readonly string[] } = {}
): Promise<{ movimientos: PjudFetchedMovimiento[]; cuadernos: PjudCuadernosCoverage }> {
  const deadlineAt = Date.now() + (options.totalTimeoutMs ?? 120_000);
  const first = await cuadernoSelector(page);
  let remainingDocuments = 0;
  let remainingDocumentBytes = 20 * 1024 * 1024;
  if (options.downloadDocuments && pjudDocumentDownloadsAllowed()) {
    remainingDocuments = (await import("@/lib/pjud/pdf-backup")).pjudDocDownloadMaxPerRun();
  }
  const download = async (rows: PjudFetchedMovimiento[]) => {
    if (remainingDocuments <= 0 || remainingDocumentBytes < 100) return rows;
    const excluded = new Set(options.excludeDocumentExternalIds);
    const allowed = options.documentExternalIds ? new Set(options.documentExternalIds) : null;
    const { isBackupableDocumentoRef } = await import("@/lib/pjud/pdf-backup");
    const eligible = rows.filter(row => isBackupableDocumentoRef(row.documentoRef) && !excluded.has(row.externalId) && (!allowed || allowed.has(row.externalId))).slice(0, remainingDocuments);
    const downloaded = await attachDocumentoBytesFromPage(page, eligible, { limit: remainingDocuments, maxTotalBytes: remainingDocumentBytes });
    const byId = new Map(downloaded.map(row => [row.externalId, row]));
    const result = rows.map(row => byId.get(row.externalId) || row);
    remainingDocuments -= eligible.length;
    remainingDocumentBytes -= downloaded.reduce((sum, row) => sum + (row.documentoBytes?.length || 0), 0);
    return result;
  };
  if (!first?.options.length) {
    let incomplete = false;
    const rows = await scrapeModalTabs(page, { ...options, deadlineAt, recoverPartial: true, onIncomplete: () => { incomplete = true; }, limit: PJUD_MAX_CAUSA_MOVIMIENTOS + 1 });
    return {
      movimientos: await download(rows.slice(0, PJUD_MAX_CAUSA_MOVIMIENTOS)),
      cuadernos: incomplete || rows.length > PJUD_MAX_CAUSA_MOVIMIENTOS ? { status: "partial", total: null, read: 0, items: [] } : unknownCuadernosCoverage(),
    };
  }
  const targets = first.options.slice(0, PJUD_MAX_CUADERNOS).map(({ key, label, cuaderno }) => ({ key, label, cuaderno }));
  const items: PjudCuadernosCoverage["items"] = [];
  let movimientos: PjudFetchedMovimiento[] = [];
  let changedList = false;
  for (const target of targets) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (Date.now() >= deadlineAt || movimientos.length >= PJUD_MAX_CAUSA_MOVIMIENTOS) {
      items.push({ key: target.key, label: target.label, status: "failed", count: 0, note: "Lectura pendiente: se alcanzó el límite de esta sincronización. Vuelva a sincronizar." });
      continue;
    }
    const incomplete: string[] = [];
    let rows: PjudFetchedMovimiento[] = [];
    try {
      await assertPjudPromptPolicy(page, options.allowPrompts === false);
      const selected = await changeCuaderno(page, { ...target, value: "" }, { ...options, timeoutMs: Math.max(1, Math.min(options.transitionTimeoutMs ?? 30_000, deadlineAt - Date.now())) });
      rows = await scrapeModalTabs(page, {
        ...options, deadlineAt, cuaderno: selected.cuaderno,
        recoverPartial: true, onIncomplete: panel => incomplete.push(panel), limit: PJUD_MAX_CAUSA_MOVIMIENTOS + 1,
      });
      const remaining = PJUD_MAX_CAUSA_MOVIMIENTOS - movimientos.length;
      if (rows.length > remaining) incomplete.push("Límite de movimientos");
      rows = await download(rows.slice(0, remaining));
      movimientos = mergePjudMovimientos(movimientos, rows);
      items.push({ key: target.key, label: selected.label, status: incomplete.length ? "failed" : "ok", count: rows.length,
        ...(incomplete.length ? { note: `Lectura incompleta: ${incomplete.join(", ")}. Se conservaron los movimientos recuperados.` } : {}) });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      items.push({ key: target.key, label: target.label, status: "failed", count: rows.length, note: "No se pudo confirmar la lectura de este cuaderno. Los demás cuadernos recuperados se conservan; vuelva a sincronizar." });
    }
  }
  const final = await cuadernoSelector(page).catch(() => undefined);
  const initialKeys = new Set(targets.map(target => target.key));
  if (!final || final.total !== first.total || final.options.some(target => !initialKeys.has(target.key))) changedList = true;
  const read = items.filter(item => item.status === "ok").length;
  const total = Math.max(first.total, final?.total || 0);
  return { movimientos, cuadernos: { status: !changedList && first.total <= PJUD_MAX_CUADERNOS && read === first.total ? "complete" : "partial", total: total <= 100_000 ? total : null, read, items } };
}

/**
 * Download OJV anexos with the authenticated Playwright session (cookies).
 * Bare `fetch()` after scrape usually hits a login wall HTML page.
 * Downloads are strictly sequential with a delay between requests.
 */
export async function attachDocumentoBytesFromPage(
  page: PlaywrightPage,
  movimientos: PjudFetchedMovimiento[],
  opts?: { limit?: number; delayMs?: number; maxTotalBytes?: number }
): Promise<PjudFetchedMovimiento[]> {
  if (!pjudDocumentDownloadsAllowed()) return movimientos;
  const { validPjudDownloadedContent, pjudDocDownloadDelayMs, pjudDocDownloadMaxPerRun } = await import("@/lib/pjud/pdf-backup");
  const limit = opts?.limit ?? pjudDocDownloadMaxPerRun(), delayMs = opts?.delayMs ?? pjudDocDownloadDelayMs();
  let remainingBytes = Math.min(opts?.maxTotalBytes ?? 20 * 1024 * 1024, 20 * 1024 * 1024), attempted = 0;
  const out: PjudFetchedMovimiento[] = [];
  const pageUrl = new URL(page.url());
  for (const movement of movimientos) {
    const ref = movement.documentoRef || null;
    let allowed = false;
    try { const url = new URL(ref || ""); allowed = url.protocol === "https:" && (!url.port || url.port === "443") && !url.username && !url.password && (url.hostname === "pjud.cl" || url.hostname.endsWith(".pjud.cl")) && pageUrl.protocol === "https:" && (!pageUrl.port || pageUrl.port === "443") && (pageUrl.hostname === "pjud.cl" || pageUrl.hostname.endsWith(".pjud.cl")); } catch { /* Not a valid official document URL. */ }
    if (attempted >= limit || remainingBytes < 100 || !allowed || !ref) { out.push(movement); continue; }
    if (attempted > 0 && delayMs > 0) await delay(delayMs);
    attempted++;
    try {
      // Same-origin reads stay in the browser; cross-origin official documents use a URL-scoped local transport.
      // APIRequestContext.get buffers the entire response; the page reader cancels at the bound.
      const result = new URL(ref).origin === pageUrl.origin ? await page.evaluate(async ({ href, maximum }) => {
        const target = new URL(href);
        if (target.protocol !== "https:" || target.origin !== location.origin || target.username || target.password || !(target.hostname === "pjud.cl" || target.hostname.endsWith(".pjud.cl"))) return null;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35_000);
        try {
          const response = await fetch(target.href, { credentials: "include", redirect: "error", cache: "no-store", signal: controller.signal });
          const contentType = response.headers.get("content-type") || "";
          if (!response.ok || /text\/html/i.test(contentType) || Number(response.headers.get("content-length") || 0) > maximum) { await response.body?.cancel(); return null; }
          const reader = response.body?.getReader();
          if (!reader) return null;
          const chunks: string[] = []; let total = 0;
          try {
            for (;;) {
              const part = await reader.read(); if (part.done) break;
              total += part.value.length;
              if (total > maximum || chunks.length > 4096) { await reader.cancel(); return null; }
              for (let offset = 0; offset < part.value.length; offset += 32768) chunks.push(btoa(String.fromCharCode(...part.value.subarray(offset, offset + 32768))));
            }
            return { chunks, contentType };
          } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        } catch { return null; }
        finally { clearTimeout(timer); }
      }, { href: ref, maximum: remainingBytes }) : null;
      const direct = new URL(ref).origin === pageUrl.origin ? null : await (await import("@/lib/pjud/authenticated-document")).readAuthenticatedPjudDocument(page, ref, remainingBytes);
      if (!result && !direct) { out.push(movement); continue; }
      const bytes = direct?.bytes || Buffer.concat(result!.chunks.map(chunk => Buffer.from(chunk, "base64")));
      const contentType = direct?.contentType || result!.contentType;
      if (!validPjudDownloadedContent(bytes, contentType, ref, remainingBytes)) { out.push(movement); continue; }
      remainingBytes -= bytes.length;
      const filename = new URL(ref).pathname.split("/").filter(Boolean).pop() || `folio-${movement.folio || attempted}.pdf`;
      out.push({ ...movement, documentoBytes: bytes, documentoFilename: filename });
    } catch { out.push(movement); }
  }
  return out;
}

export async function fillRolSearchFields(
  page: PlaywrightPage,
  ritParts: NonNullable<ReturnType<typeof parseRitParts>>,
  tipoOverride?: string | null
) {
  const tipo = tipoOverride === undefined ? ritParts.tipo : tipoOverride;
  const fills: Array<[string, string]> = [
    [
      '#conRolCausa, input[id*="rit" i], input[name*="rit" i], input[id*="rol" i], input[name*="rol" i]',
      ritParts.numero,
    ],
    [
      '#conEraCausa, input[id*="era" i], input[name*="era" i], input[id*="ano" i], input[name*="ano" i]',
      ritParts.era,
    ],
  ];
  if (tipo) {
    // Selecting the book/type can reset the remaining cause fields.
    fills.unshift([
      '#conTipoCausa, input[id*="tipo" i], select[id*="tipo" i], input[name*="tipo" i], select[id*="rit" i]',
      tipo,
    ]);
  }
  for (const [sel, value] of fills) {
    const field = page.locator(sel).filter({ visible: true }).first();
    if ((await field.count()) === 0) throw new PjudScrapeError("El formulario RIT/ROL de OJV cambió o no está disponible.");
    const tag = await field.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      await field
        .selectOption({ label: value })
        .catch(async () =>
          field.selectOption({ value })
        );
    } else {
      await field.fill(value);
    }
  }
}

async function solveNewSession(signal?: AbortSignal): Promise<PjudSession> {
  await assertPublicScrapeRuntime();
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
    await page.goto(OJV_CONSULTA_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await closeSweetAlerts(page);
    await closeBootstrapModals(page);
    await maybeSolveCaptchaOnPage(page, signal);
    // Establish guest consulta session so cookies are meaningful.
    await enterConsultaCausas(page, { signal });
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
    await page.goto(OJV_CONSULTA_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if ((await readConsultaFormState(page)).captchaVisible) {
      if (!pjudCaptchaAutoSolveAllowed()) {
        throw new PjudScrapeError("OJV mostró un CAPTCHA. La resolución automática está deshabilitada; requiere intervención manual.", 409);
      }
      invalidateSession();
      throw new PjudSessionExpiredError(
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
  /** Tribunal label as seen on OJV listing (may refine local catalog name). */
  resolvedTribunal?: string | null;
  cuadernos?: PjudCuadernosCoverage;
};

async function scrapeCausaByRolOnce(
  causa: PjudCausaRef,
  session: PjudSession,
  signal?: AbortSignal,
  options: { downloadDocuments?: boolean } = {}
): Promise<ScrapeLookupResult> {
  return withConsultaPage(session, async (page) => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const ritParts = parseRitParts(causa.rit || "");
    if (!ritParts || !causa.rit || isPlaceholderTribunal(causa.tribunal)) {
      throw new PjudScrapeError("Se requiere RIT/ROL válido y tribunal identificado para confirmar el expediente.", 400);
    }
    const rolTab = page.locator(OJV.tabBusRol).filter({ visible: true }).first();
    if ((await rolTab.count()) === 0) {
      throw new PjudScrapeError("No se encontró la pestaña RIT/ROL de OJV. No se usará el RUC como RUT de litigante.");
    }
    await rolTab.click();
    await delay(400);
    await selectTribunalOrCorte(page, causa.tribunal || "");
    await fillRolSearchFields(page, ritParts);
    await clickBuscar(page);

    const identity = {
      rit: causa.rit,
      tribunal: causa.tribunal || "",
    };
    let resolvedTribunal: string | null = null;
    await collectOjvResultPages(page, async () => {
      resolvedTribunal = await openExactCauseModal(page, identity);
      return Boolean(resolvedTribunal);
    });
    if (!resolvedTribunal) {
      throw new PjudScrapeError(`No se encontró una fila exacta para ${causa.rit} y «${causa.tribunal}» en OJV. Revise RIT/ROL y tribunal.`, 404);
    }
    const html = await modalInnerHtml(page);
    if (!html) throw new PjudScrapeError("OJV no devolvió el detalle de la causa seleccionada.");
    const { movimientos, cuadernos } = await scrapeAllCuadernos(page, { signal, downloadDocuments: options.downloadDocuments !== false });

    const sala = parseSalaFromHtml(html);
    const withDocs = movimientos.filter((m) => m.documentoBytes).length;
    if (movimientos.length === 0 && cuadernos.status === "unknown" && !hasExplicitEmptyHistory(html)) {
      throw new PjudScrapeError(
        `El detalle de ${causa.rit} se abrió, pero no se reconoció su historial. No se crearán movimientos desde el listado. Portal: ${OJV_CONSULTA_URL}`
      );
    }

    return {
      movimientos,
      sala,
      note: `Scrape OJV (sesión de consulta): ${movimientos.length ? `${movimientos.length} movimiento(s)` : cuadernos.status === "partial" ? "no se recuperaron movimientos verificables" : "OJV informó un historial sin movimientos"}${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}. ${cuadernosCoverageNote(cuadernos)} No oficial; verifique en ${OJV_CONSULTA_URL}`,
      portalUrl: OJV_CONSULTA_URL,
      resolvedTribunal,
      cuadernos,
    };
  });
}

/**
 * Lookup por RIT/ROL + tribunal — equivalente al sync inmediato de CausaMonitor.
 */
export async function scrapeCausaByRol(
  causa: PjudCausaRef,
  signal?: AbortSignal,
  options: { downloadDocuments?: boolean } = {}
): Promise<ScrapeLookupResult> {
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError(
      "PJUD_PUBLIC_SCRAPE!=1: scrape público deshabilitado (kill switch)."
    );
  }
  if (!causa.rit || !parseRitParts(causa.rit) || isPlaceholderTribunal(causa.tribunal)) {
    throw new PjudScrapeError("Se requiere RIT/ROL válido y tribunal identificado para confirmar el expediente.", 400);
  }

  const cacheKey = `rol:${options.downloadDocuments === false ? "metadata" : "documents"}:${(causa.tribunal || "").toLowerCase()}:${(causa.rit || causa.ruc || "").toLowerCase()}`;
  const cached = cacheGet<ScrapeLookupResult>(cacheKey);
  if (cached) return { ...cached, note: `${cached.note} · cache` };

  let result: ScrapeLookupResult;
  try {
    const session = await getValidSession(signal);
    result = await scrapeCausaByRolOnce(causa, session, signal, options);
  } catch (error) {
    if (error instanceof PjudSessionExpiredError) {
      invalidateSession();
      const fresh = await getValidSession(signal);
      result = await scrapeCausaByRolOnce(causa, fresh, signal, options);
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
      "Scrape público deshabilitado. Active PJUD_PUBLIC_SCRAPE=1 para intentar la consulta OJV."
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
        await clickBuscar(page);
        await collectOjvResultPages(page, async () => {
          const results = page.locator(OJV.resultsHost).filter({ visible: true }).first();
          if (!(await results.count())) throw new PjudScrapeError("OJV no mostró el listado de resultados. No se puede confirmar una búsqueda vacía.");
          const html = await results.innerHTML();
          const fromTable = parseVerDetalleJuridicaHtml(html);
          const parsed = fromTable.length ? fromTable : parseCausasListFromHtml(html);
          if (!parsed.length && !/no se han encontrado resultados|sin resultados|no se encontraron (?:causas|resultados)/i.test(await results.innerText())) {
            throw new PjudScrapeError("OJV no devolvió filas reconocibles ni confirmó que la consulta esté vacía.");
          }
          all.push(...parsed);
        });
      }

      // Dedupe
      const seen = new Set<string>();
      const unique = all.filter((c) => {
        const key = `${c.rit}|${c.tribunal}`.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique;
    });

  let items: MisCausasItem[];
  try {
    items = await run(await getValidSession(signal));
  } catch (error) {
    if (error instanceof PjudSessionExpiredError) {
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
 *
 * El portal nuevo es SPA (Nuxt): no hay inputs en el HTML inicial.
 * `/accounts/login/` sin `?next=` puede devolver 404; hay que llegar vía
 * el enlace ClaveÚnica de OJV (OIDC) o URLs sin trailing slash.
 *
 * No usar id*="rut": coincide con #rut_hidden (input oculto).
 */
export const CLAVEUNICA_RUT_SELECTORS = [
  'input#uname:visible',
  'input[name="run" i]:visible',
  'input[name="rut" i]:visible',
  'input[autocomplete="username"]:visible',
  'input[placeholder*="RUN" i]:visible',
  'input[aria-label*="RUN" i]:visible',
  'form input[type="text"]:visible',
  'form input[type="tel"]:visible',
].join(", ");

export const CLAVEUNICA_PASSWORD_SELECTORS = [
  'input#pword:visible',
  'input[type="password"]:visible',
  'input[name*="password" i]:visible',
  'input[autocomplete="current-password"]:visible',
  'input[placeholder*="Clave" i]:visible',
  'input[aria-label*="Clave" i]:visible',
].join(", ");

export const CLAVEUNICA_LOGIN_URLS = [
  "https://accounts.claveunica.gob.cl/accounts/login",
  "https://accounts.claveunica.gob.cl/openid/login",
] as const;

/** RUN con puntos para el campo visible de ClaveÚnica (12.345.678-5). */
export function formatClaveUnicaRunInput(rut: string): string {
  const compact = rut.trim().replace(/\./g, "").replace(/\s+/g, "");
  const parts = /^(\d+)-([\dkK])$/i.exec(compact);
  if (!parts) return rut.trim();
  const body = parts[1]!;
  const dv = parts[2]!.toUpperCase();
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any;

async function fillClaveUnicaLoginForm(page: AnyPage, rut: string, password: string) {
  const runValue = formatClaveUnicaRunInput(rut);
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

  let rutField = rutCandidates[2];
  let found = false;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline && !found) {
    for (const candidate of rutCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        rutField = candidate;
        found = true;
        break;
      }
    }
    if (!found) await sleep(400);
  }
  if (!found) {
    const url = new URL(page.url());
    throw new PjudScrapeError(
      `No se encontró el campo RUN visible de ClaveÚnica (url=${url.origin}${url.pathname}). El sitio puede haber cambiado o bloquear automatización.`
    );
  }

  let passField = passCandidates[2];
  found = false;
  const passDeadline = Date.now() + 15_000;
  while (Date.now() < passDeadline && !found) {
    for (const candidate of passCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        passField = candidate;
        found = true;
        break;
      }
    }
    if (!found) await sleep(300);
  }
  if (!found) {
    throw new PjudScrapeError(
      "No se encontró el campo de contraseña visible de ClaveÚnica."
    );
  }

  await rutField.click({ timeout: 5_000 }).catch(() => undefined);
  await rutField.fill("");
  try {
    await rutField.pressSequentially(runValue, { delay: 25 });
  } catch {
    await rutField.fill(runValue);
  }
  await passField.click({ timeout: 5_000 }).catch(() => undefined);
  await passField.fill("");
  try {
    await passField.pressSequentially(password, { delay: 20 });
  } catch {
    await passField.fill(password);
  }

  const submit = page
    .getByRole("button", { name: /INGRESA|Ingresar|Continuar|Entrar/i })
    .or(
      page.locator(
        `${OJV.submit}, button[type="submit"]:visible, input[type="submit"]:visible`
      )
    )
    .first();

  const navAway = page
    .waitForURL(
      (url: URL) => !/accounts\.claveunica\.gob\.cl\/accounts\/login/i.test(url.href),
      { timeout: 90_000 }
    )
    .catch(() => undefined);
  await submit.click({ timeout: 15_000 });
  await navAway;
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await sleep(800);

  // Si seguimos en el login, el sitio mostró error / CAPTCHA / credenciales.
  if (isClaveUnicaAccountsUrl(page.url()) && /\/accounts\/login/i.test(page.url())) {
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const hint = /incorrect|inv[aá]lid|error|bloquead|captcha|intentos/i.test(body)
      ? " El portal reportó un error de acceso (credenciales, bloqueo o CAPTCHA)."
      : " Sigue en la página de login (posible CAPTCHA invisible o rechazo del sitio).";
    throw new PjudScrapeError(
      `No se completó el login de ClaveÚnica.${hint}`
    );
  }
}

/** Materias típicas del menú Mis Causas (manual OJV). */
export const MIS_CAUSAS_MATERIAS = [
  "Civil",
  "Familia",
  "Laboral",
  "Cobranza",
  "Penal",
  "Garantía",
  "Tribunal Oral",
  "Apelaciones",
  "Corte Suprema",
  "Constitucional",
] as const;

async function dismissOjvPrompts(page: AnyPage) {
  if (manualPjudInteractionActive() || process.env.PJUD_AUTO_CONFIRM_PROMPTS === "0") {
    await assertPjudPromptPolicy(page);
    return;
  }
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);
  // Términos / “Acepto” en primer ingreso
  const accept = page
    .getByRole("button", {
      name: /Acepto|Aceptar|Continuar|Entendido|OK|De acuerdo/i,
    })
    .or(
      page.locator(
        'button:has-text("Acepto"), input[value*="Acepto" i], a:has-text("Acepto")'
      )
    )
    .first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click({ timeout: 5_000 }).catch(() => undefined);
    await sleep(500);
    await closeSweetAlerts(page);
  }
}

export type MisCausasMateria = typeof MIS_CAUSAS_MATERIAS[number] | "Corte Apelaciones";
export type MisCausasReadOptions = {
  allowPrompts?: boolean;
  downloadDocuments?: boolean;
  excludeDocumentExternalIds?: readonly string[]; documentExternalIds?: readonly string[];
  responseTimeoutMs?: number;
  materias?: readonly MisCausasMateria[];
  signal?: AbortSignal;
};

function assertMisCausasReadActive(options: MisCausasReadOptions) {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function waitForMisCausasMenuReady(page: AnyPage, options: MisCausasReadOptions) {
  const materias = options.materias ?? MIS_CAUSAS_MATERIAS;
  const names = new RegExp(`^(?:${materias.map(materia => materia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`, "i");
  let ready = page.getByRole("link", { name: names })
    .or(page.getByRole("button", { name: names }))
    .or(page.getByText(names, { exact: true }));
  if (!options.materias) {
    ready = ready.or(page.locator('label.switch:has(input[id^="filtroMisCau"]), [id^="btnConsultaMisCau"], table[id^="dtaTableDetalleMisCau"], #verDetalleJuridica'))
      .or(page.getByRole("button", { name: /^(?:Buscar|Filtros)$/i }));
  }
  const deadline = Date.now() + 8_000;
  do {
    assertMisCausasReadActive(options);
    await assertPjudPromptPolicy(page, true);
    if (await ready.filter({ visible: true }).count()) return;
    await sleep(100);
  } while (Date.now() < deadline);
  throw new PjudScrapeError("El menú de Mis Causas no terminó de cargar las materias seleccionadas.");
}

async function openMisCausasMenu(page: AnyPage, options: MisCausasReadOptions = {}): Promise<boolean> {
  if (options.allowPrompts === false) {
    // Only close a recognized record detail; terms and notices remain untouched.
    await assertPjudPromptPolicy(page, true);
    const details = page.locator('.modal[id^="modalDetalle"]:has(table.table-titulos)').filter({ visible: true });
    let closedDetail = false;
    for (const detail of await details.all()) {
      assertMisCausasReadActive(options);
      const close = detail.locator('button[data-dismiss="modal"], a[data-dismiss="modal"], button[data-bs-dismiss="modal"], a[data-bs-dismiss="modal"], .modal-header .close')
        .filter({ visible: true, hasNotText: /\b(?:Acepto|Aceptar|Continuar|Entendido|OK|De acuerdo|Confirmar)\b/i }).first();
      if (!(await close.count())) throw new PjudScrapeError("Cierre el detalle abierto antes de continuar con Mis Causas.");
      await close.click({ timeout: 8_000 });
      await detail.waitFor({ state: "hidden", timeout: 8_000 });
      closedDetail = true;
    }
    if (closedDetail) {
      // Bootstrap can hide the record before its backdrop finishes fading out.
      // Wait for the portal to remove it; never remove overlays ourselves.
      await assertPjudPromptPolicy(page, true);
      await page.locator(".modal-backdrop").filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 8_000 });
    }
    assertMisCausasReadActive(options);
    await assertPjudPromptPolicy(page, true);
    const visible = page.getByRole("link", { name: /^Mis Causas$/i })
      .or(page.getByRole("button", { name: /^Mis Causas$/i }))
      .or(page.locator(OJV.misCausasMenu)).filter({ visible: true }).first();
    if (!(await visible.count())) return false;
    await visible.click({ timeout: 8_000 });
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await waitForMisCausasMenuReady(page, options);
    return true;
  }
  const candidates = [
    page.getByRole("link", { name: /^Mis Causas$/i }).first(),
    page.getByRole("button", { name: /^Mis Causas$/i }).first(),
    page.locator(OJV.misCausasMenu).first(),
    page.locator("#menuMisCausas, #misCausas, a[href*='misCausa' i]").first(),
  ];
  for (const loc of candidates) {
    if ((await loc.count().catch(() => 0)) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) {
      await loc.click({ force: true, timeout: 8_000 }).catch(() => undefined);
    } else {
      await loc.click({ timeout: 8_000 }).catch(() => undefined);
    }
    await page
      .waitForLoadState("domcontentloaded")
      .catch(() => undefined);
    await sleep(700);
    await dismissOjvPrompts(page);
    return true;
  }
  // Intento por texto en sidebar / menú
  const byText = page.locator("text=/^\\s*Mis Causas\\s*$/i").first();
  if ((await byText.count().catch(() => 0)) > 0) {
    await byText.click({ force: true, timeout: 8_000 }).catch(() => undefined);
    await sleep(700);
    return true;
  }
  return false;
}

async function misCausasActiveScope(page: PlaywrightPage) {
  const active = page.locator(".tab-pane.active").filter({ visible: true });
  const current = active.filter({ has: page.locator('[id^="filtroMisCau"], [id^="btnConsultaMisCau"], table[id^="dtaTableDetalleMisCau"]') });
  if (await current.count()) return current.last();
  return await active.count() ? active.last() : page.locator("body");
}

export async function clickMisCausasBuscar(page: AnyPage, options: MisCausasReadOptions = {}, scope?: Locator) {
  const panel = scope ?? await misCausasActiveScope(page);
  const buscar = panel
    .getByRole("button", { name: /^Buscar$/i })
    .or(panel.locator(OJV.misCausasBuscar))
    .filter({ visible: true }).first();
  if ((await buscar.count().catch(() => 0)) === 0) {
    if (options.allowPrompts === false) throw new PjudScrapeError("No se encontró un botón Buscar visible en Mis Causas.");
    return false;
  }
  if (options.allowPrompts === false) {
    await snapshotManualMisCausasRows(page);
    await buscar.click({ timeout: 8_000 });
    return waitForFreshManualMisCausasRows(page, options.responseTimeoutMs, scope);
  } else {
    await buscar.click({ timeout: 8_000 });
  }
  await sleep(1200);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  return true;
}

/** Follow visible, enabled next controls; repeated pages and truncation are errors. */
export async function collectOjvResultPages(
  page: PlaywrightPage,
  visitPage: () => Promise<boolean | void>,
  scope?: Locator
): Promise<boolean> {
  const panel = scope ?? page;
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const signature = await panel.locator("tr, .card, .list-group-item, .pagination, .dataTables_paginate").filter({ visible: true })
      .allTextContents().then((texts) => texts.join("\n"));
    if (seen.has(signature)) throw new PjudScrapeError("La paginación de OJV repitió una página. La consulta quedó incompleta; reintente.");
    seen.add(signature);
    if (await visitPage()) return true;
    const next = panel
      .getByRole("link", { name: /^(Siguiente|Next|›|»)$/i })
      .or(panel.getByRole("button", { name: /^(Siguiente|Next|›|»)$/i }))
      .or(panel.locator('.pagination a[rel="next"], [aria-label="Next" i], [aria-label="Siguiente" i], .paginate_button.next, a.page-link:has-text("›")'))
      .filter({ visible: true }).first();
    if (!(await next.count())) return false;
    const disabled = await next.evaluate((el) => Boolean(
      el.closest('.disabled, [aria-disabled="true"], [disabled]')
    ));
    if (disabled) return false;
    if (i === 24) throw new PjudScrapeError("OJV superó el límite de 25 páginas. La consulta quedó incompleta; acote los filtros.");
    await next.click({ timeout: 8_000 });
    await sleep(900);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  }
  return false;
}

export async function applyMisCausasFiltros(page: AnyPage) {
  const scope = await misCausasActiveScope(page);
  // The current portal hides the input itself; its visible label is the control.
  const switchLabel = scope.locator('label.switch:has(input[id^="filtroMisCau"])').filter({ visible: true }).first();
  if (await switchLabel.count()) {
    const checkbox = switchLabel.locator('input[id^="filtroMisCau"]').first();
    if (!(await checkbox.isChecked())) {
      await switchLabel.click({ timeout: 8_000 });
      if (!(await checkbox.isChecked())) throw new PjudScrapeError("No se pudo activar el filtro visible de Mis Causas.");
    }
  } else {
    const filtros = scope.getByRole("button", { name: /Filtros/i }).filter({ visible: true }).first();
    if (await filtros.count()) {
      await filtros.click();
      await sleep(300);
    }
  }
  // Manual OJV: Estado → Seleccionar Todos para no omitir concluidas.
  const estado = scope
    .getByRole("button", { name: /^Estado$/i })
    .or(scope.getByText(/^Estado$/i))
    .filter({ visible: true })
    .first();
  if (await estado.isVisible().catch(() => false)) {
    await estado.click().catch(() => undefined);
    await sleep(200);
  }
  const selectAll = scope
    .getByText(/Seleccionar Todos|Seleccionar todos/i)
    .filter({ visible: true })
    .first();
  if (await selectAll.isVisible().catch(() => false)) {
    await selectAll.click().catch(() => undefined);
    await sleep(200);
  }
}

function parseMisCausasItemsFromHtml(html: string): MisCausasItem[] {
  return parseMisCausasFromHtml(html);
}

async function pagesAndFramesHtml(page: AnyPage): Promise<string> {
  const chunks: string[] = [];
  try {
    chunks.push(await page.content());
  } catch {
    /* ignore */
  }
  for (const frame of page.frames?.() || []) {
    try {
      if (frame === page.mainFrame?.()) continue;
      const html = await frame.content();
      if (html && html.length > 200) chunks.push(html);
    } catch {
      /* cross-origin */
    }
  }
  return chunks.join("\n");
}

async function ensureAuthenticatedOjvShell(page: AnyPage, options: MisCausasReadOptions = {}): Promise<AnyPage> {
  // A manual probe must use the user's current session, without navigating
  // past terms/login screens or confirming prompts on their behalf.
  if (options.allowPrompts === false) return page;
  await dismissOjvPrompts(page);
  const onOjv = /oficinajudicialvirtual\.pjud\.cl|ojv\.pjud\.cl/i.test(page.url());
  const needsShell =
    !onOjv || /return\.php|\/home\/(?:index\.php)?(?:[?#]|$)|accounts\.claveunica/i.test(page.url());
  if (!needsShell) return page;

  for (const url of OJV_POST_AUTH_URLS) {
    const res = await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })
      .catch(() => null);
    await dismissOjvPrompts(page);
    if (res && (res.ok() || /indexN\.php/i.test(page.url()))) {
      return page;
    }
  }
  return page;
}

export async function collectMisCausasFromAuthenticatedOjv(
  page: AnyPage,
  options: MisCausasReadOptions = {}
): Promise<{ items: MisCausasItem[]; openedMenu: boolean; materiasTried: string[] }> {
  assertMisCausasReadActive(options);
  if (options.allowPrompts === false) await assertPjudPromptPolicy(page, true);
  page = await ensureAuthenticatedOjvShell(page, options);

  const openedMenu = await openMisCausasMenu(page, options);
  const materiasTried: string[] = [];
  const all: MisCausasItem[] = [];
  const seen = new Set<string>();

  const pushItems = (items: MisCausasItem[]) => {
    for (const item of items) {
      const key = `${item.rit}|${item.tribunal}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
  };
  const pushParsed = async () => pushItems(parseMisCausasItemsFromHtml(await pagesAndFramesHtml(page)));
  const searchAndCollect = async () => {
    const firstResponse = await clickMisCausasBuscar(page, options);
    if (options.allowPrompts === false) {
      let first = true;
      await collectOjvResultPages(page, async () => {
        const fresh = first && Array.isArray(firstResponse)
          ? firstResponse
          : await waitForFreshManualMisCausasRows(page, options.responseTimeoutMs);
        first = false;
        pushItems(fresh);
      });
    } else {
      await collectOjvResultPages(page, pushParsed);
    }
  };

  try {
    if (options.allowPrompts !== false) await pushParsed();

    for (const materia of options.materias ?? MIS_CAUSAS_MATERIAS) {
      assertMisCausasReadActive(options);
      if (options.allowPrompts === false) await assertPjudPromptPolicy(page, true);
      let tab = page
        .getByRole("link", { name: new RegExp(`^${materia}$`, "i") })
        .or(page.getByRole("button", { name: new RegExp(`^${materia}$`, "i") }))
        .or(
          page.locator(
            `a:has-text("${materia}"), button:has-text("${materia}"), li:has-text("${materia}") > a, div.card:has-text("${materia}")`
          )
        );
      if (options.allowPrompts === false) tab = tab.filter({ visible: true });
      tab = tab.first();
      if ((await tab.count().catch(() => 0)) === 0) continue;
      if (options.allowPrompts === false) {
        await tab.click({ timeout: 8_000 });
      } else if (!(await tab.isVisible().catch(() => false))) {
        // Algunas materias están en acordeón colapsado.
        await tab.click({ force: true, timeout: 8_000 }).catch(() => undefined);
      } else {
        await tab.click({ timeout: 8_000 }).catch(() => undefined);
      }
      materiasTried.push(materia);
      await sleep(500);

      await applyMisCausasFiltros(page);
      await searchAndCollect();
    }

    if (materiasTried.length === 0) {
      if (options.materias) throw new PjudScrapeError("No se encontraron las materias seleccionadas en Mis Causas.");
      await applyMisCausasFiltros(page);
      await searchAndCollect();
    }

    return { items: all, openedMenu, materiasTried };
  } finally {
    if (options.allowPrompts === false) await clearManualMisCausasRows(page);
  }
}

/**
 * Abre el login OIDC real desde OJV.
 *
 * OJV tiene varios "Clave Única": el marketing (`https://claveunica.gob.cl/`)
 * y el OIDC (`AutenticaCUnica()` → submit `#cuform`). El selector genérico
 * `a[href*="claveunica"]` caía en el portal ciudadano y el login fallaba.
 */
export async function openClaveUnicaFromOjv(page: AnyPage): Promise<AnyPage | null> {
  const oidc = await startClaveUnicaOidcFromOjv(page).catch(() => ({ page: null, started: null }));
  if (oidc.page) {
    await oidc.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return oidc.page;
  }

  const authLink = page
    .locator(
      'a[onclick*="AutenticaCUnica"], button[onclick*="AutenticaCUnica"], #cuform a, a:has-text("Clave Única")[href="#"], a:has-text("ClaveÚnica")[href="#"]'
    )
    .first();
  if ((await authLink.count()) > 0) {
    // El enlace OIDC suele estar oculto en el DOM; force evita el marketing visible.
    const transition = await waitForOidcPageAfterTrigger(page, () => authLink.click({ timeout: 10_000, force: true }));
    if (transition.page) {
      await transition.page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return transition.page;
    }
  }

  // Último recurso: solo accounts.* (nunca claveunica.gob.cl marketing).
  const accountsLink = page
    .locator('a[href*="accounts.claveunica.gob.cl"]')
    .first();
  if ((await accountsLink.count()) > 0) {
    const transition = await waitForOidcPageAfterTrigger(page, () => accountsLink.click({ timeout: 10_000, force: true }));
    if (transition.page) {
      await transition.page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return transition.page;
    }
  }

  return null;
}

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
  if (!(await playwrightAvailable())) {
    throw new PjudScrapeError(
      `Playwright/Chromium no disponible. ${pjudPlaywrightInstallHint()}`,
      502
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
    let page: AnyPage = await context.newPage();
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await closeSweetAlerts(page);
    await maybeSolveCaptchaOnPage(page, opts.signal);

    const cuPage = await openClaveUnicaFromOjv(page);
    if (cuPage && isClaveUnicaAccountsUrl(cuPage.url())) {
      page = cuPage;
    } else {
      // Sin token OIDC (`?next=`), accounts.* suele responder 404/"Página no encontrada".
      throw new PjudScrapeError(
        "No se pudo abrir el login OIDC de ClaveÚnica desde OJV (AutenticaCUnica / #cuform). No use el enlace al portal ciudadano claveunica.gob.cl."
      );
    }

    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
    await fillClaveUnicaLoginForm(page, opts.rut, opts.password);

    // Tras OIDC puede haber popup de return.php; preferir pestaña OJV.
    const pages = page.context().pages();
    for (const p of pages) {
      if (/oficinajudicialvirtual\.pjud\.cl|ojv\.pjud\.cl/i.test(p.url())) {
        page = p;
        break;
      }
    }
    await page
      .waitForURL(/pjud\.cl/i, { timeout: 60_000 })
      .catch(() => undefined);
    await page
      .waitForLoadState("domcontentloaded")
      .catch(() => undefined);
    await dismissOjvPrompts(page);

    const { items, openedMenu, materiasTried } =
      await collectMisCausasFromAuthenticatedOjv(page);

    if (items.length === 0) {
      const location = new URL(page.url());
      const url = `${location.origin}${location.pathname}`;
      const stillLogin = isClaveUnicaAccountsUrl(url);
      throw new PjudScrapeError(
        stillLogin
          ? `El login de ClaveÚnica no llegó a OJV (url=${url}). Revise credenciales o CAPTCHA.`
          : [
              "Se autenticó en ClaveÚnica pero no se listaron causas en Mis Causas.",
              openedMenu
                ? `Menú Mis Causas abierto; materias probadas: ${materiasTried.join(", ") || "(ninguna visible)"}.`
                : "No se encontró el menú «Mis Causas» (sesión incompleta o layout distinto).",
              `url=${url}.`,
              "En OJV: Mis Causas → materia (p. ej. Civil/Familia) → Filtros/Buscar.",
            ].join(" ")
      );
    }
    return items;
  } finally {
    await browser.close();
  }
}

/**
 * Detalle autenticado (Mis Causas → lupa → historia/receptor/escritos).
 * Preferible al guest lookup cuando la causa viene del vault ClaveÚnica:
 * trae cuadernos/trámites que la consulta pública a veces no expone.
 */
/** Continue an identified OJV page without reading credentials or starting another login. */
export async function readCausaDetailFromAuthenticatedOjv(
  page: PlaywrightPage,
  causa: PjudCausaRef,
  options: MisCausasReadOptions = {}
): Promise<ScrapeLookupResult> {
  if (!causa.rit || !parseRitParts(causa.rit) || isPlaceholderTribunal(causa.tribunal)) {
    throw new PjudScrapeError("Se requiere RIT válido y tribunal identificado para detalle ClaveÚnica.", 400);
  }
  assertMisCausasReadActive(options);
  if (options.allowPrompts === false) await assertPjudPromptPolicy(page, true);
  page = await ensureAuthenticatedOjvShell(page, options);
  const menuOpened = await openMisCausasMenu(page, options);
  if (!menuOpened && options.allowPrompts === false) {
    throw new PjudScrapeError("No se encontró el menú de Mis Causas en la sesión identificada.");
  }

  const identity = { rit: causa.rit, tribunal: causa.tribunal };
  const searchForDetail = async () => {
    await applyMisCausasFiltros(page);
    const scope = options.allowPrompts === false ? await misCausasActiveScope(page) : undefined;
    const response = await clickMisCausasBuscar(page, options, scope);
    let firstPage = Array.isArray(response) ? response : undefined;
    return collectOjvResultPages(page, async () => {
      if (scope) {
        const fresh = firstPage ?? await waitForFreshManualMisCausasRows(page, options.responseTimeoutMs, scope);
        firstPage = undefined;
        if (!fresh.some((item) => ritLabelsMatch(item.rit, identity.rit) && tribunalLabelsMatch(item.tribunal, identity.tribunal))) {
          return false;
        }
      }
      return Boolean(await openExactCauseModal(page, identity, "tr, .card, .list-group-item", scope));
    }, scope);
  };

  let opened = false;
  try {
    for (const materia of options.materias ?? MIS_CAUSAS_MATERIAS) {
      assertMisCausasReadActive(options);
      if (options.allowPrompts === false) await assertPjudPromptPolicy(page, true);
      let tab = page
        .getByRole("link", { name: new RegExp(`^${materia}$`, "i") })
        .or(page.getByRole("button", { name: new RegExp(`^${materia}$`, "i") }))
        .or(page.locator(`a:has-text("${materia}"), button:has-text("${materia}"), li:has-text("${materia}") > a`));
      if (options.allowPrompts === false) tab = tab.filter({ visible: true });
      tab = tab.first();
      if ((await tab.count().catch(() => 0)) === 0) continue;
      if (options.allowPrompts === false) {
        await tab.click({ timeout: 8_000 });
      } else {
        await tab.click({ force: !(await tab.isVisible().catch(() => false)), timeout: 8_000 }).catch(() => undefined);
      }
      await sleep(400);
      opened = await searchForDetail();
      if (opened) break;
    }
    if (!opened && !options.materias) {
      opened = await searchForDetail();
    }
    if (!opened) throw new PjudScrapeError("No se encontró un detalle exacto para el RIT/ROL y tribunal solicitados en Mis Causas.");

    assertMisCausasReadActive(options);
    const historyHtml = await modalInnerHtml(page);
    const { movimientos, cuadernos } = await scrapeAllCuadernos(page, { signal: options.signal, allowPrompts: options.allowPrompts, downloadDocuments: options.downloadDocuments ?? options.allowPrompts !== false, excludeDocumentExternalIds: options.excludeDocumentExternalIds, documentExternalIds: options.documentExternalIds });
    const sala = parseSalaFromHtml(await modalInnerHtml(page));
    const withDocs = movimientos.filter((movement) => movement.documentoBytes).length;
    if (movimientos.length === 0 && cuadernos.status === "unknown" && !hasExplicitEmptyHistory(historyHtml)) {
      throw new PjudScrapeError("El detalle identificado no mostró un historial reconocible en Mis Causas.");
    }
    return {
      movimientos,
      sala,
      note: `Scrape Mis Causas (sesión identificada): ${movimientos.length ? `${movimientos.length} movimiento(s)` : cuadernos.status === "partial" ? "no se recuperaron movimientos verificables" : "OJV informó un historial sin movimientos"}${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}. ${cuadernosCoverageNote(cuadernos)}`,
      portalUrl: OJV_INDEX_N,
      resolvedTribunal: causa.tribunal,
      cuadernos,
    };
  } finally {
    if (options.allowPrompts === false) await clearManualMisCausasRows(page);
  }
}

export async function scrapeCausaDetailWithClaveUnica(opts: {
  rut: string;
  password: string;
  causa: PjudCausaRef;
  signal?: AbortSignal;
  optedIn?: boolean;
}): Promise<ScrapeLookupResult> {
  if (!opts.causa.rit || !parseRitParts(opts.causa.rit) || isPlaceholderTribunal(opts.causa.tribunal)) {
    throw new PjudScrapeError("Se requiere RIT válido y tribunal identificado para detalle ClaveÚnica.", 400);
  }
  if (!claveUnicaAutomationAllowed(opts.optedIn)) {
    throw new PjudScrapeError(
      "Automatización ClaveÚnica deshabilitada para detalle de causa.",
      409
    );
  }
  if (!publicScrapeEnabled()) {
    throw new PjudScrapeError("PJUD_PUBLIC_SCRAPE!=1", 409);
  }
  if (!(await playwrightAvailable())) {
    throw new PjudScrapeError(
      `Playwright/Chromium no disponible. ${pjudPlaywrightInstallHint()}`,
      502
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
    let page: AnyPage = await context.newPage();
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await closeSweetAlerts(page);
    await maybeSolveCaptchaOnPage(page, opts.signal);

    const cuPage = await openClaveUnicaFromOjv(page);
    if (cuPage && isClaveUnicaAccountsUrl(cuPage.url())) {
      page = cuPage;
    } else {
      throw new PjudScrapeError(
        "No se pudo abrir el login OIDC de ClaveÚnica desde OJV."
      );
    }
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
    await fillClaveUnicaLoginForm(page, opts.rut, opts.password);
    const pages = page.context().pages();
    for (const p of pages) {
      if (/oficinajudicialvirtual\.pjud\.cl|ojv\.pjud\.cl/i.test(p.url())) {
        page = p;
        break;
      }
    }
    await page.waitForURL(/pjud\.cl/i, { timeout: 60_000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await dismissOjvPrompts(page);

    return await readCausaDetailFromAuthenticatedOjv(page, opts.causa, { signal: opts.signal });
  } finally {
    await browser.close();
  }
}

