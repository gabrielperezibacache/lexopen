/**
 * Scrape Oficina Judicial Virtual — paridad CausaMonitor.
 *
 * OPT-IN + ToS risk: requiere PJUD_PUBLIC_SCRAPE=1 y solver CAPTCHA.
 * Flujo DOM = portal OJV real (selectores de campo tipo consulta_causas_pjud).
 * NO depende de mcp-legal-chile (flujo MCP no comprobado en producción).
 *
 * Dos vías (como CausaMonitor):
 * 1) Invitado: home → accesoConsultaCausas() → menú Consulta Unificada → tab RUT/ROL →
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
  pickTribunalFromTexts,
  splitRut,
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
import path from "node:path";
import type { MisCausasItem } from "@/lib/pjud/types";
import { omitLegacyScrapeAliases, type PjudCausaRef, type PjudFetchedMovimiento } from "@/lib/pjud/types";

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

/** Follow the visible guest entry and the shell's observed Consulta Unificada menu. */
export async function enterConsultaCausas(
  page: PlaywrightPage,
  opts: { formTimeoutMs?: number; signal?: AbortSignal } = {}
) {
  const timeout = opts.formTimeoutMs ?? 20_000;
  const form = () => page.locator(
    '#jurCompetencia, #rutJur, a[href="#BusJuridica"], a[href="#BusCausa"], a[href="#buscCausa"], a[href*="BusRol" i]'
  ).filter({ visible: true }).first();
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);

  if (!(await form().count())) {
    const acceso = page.locator(OJV.accesoConsulta).filter({ visible: true }).first();
    if (await acceso.count()) {
      try {
        await acceso.click({ timeout: 15_000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
      } catch {
        throw new PjudScrapeError("No se pudo completar el acceso invitado a OJV. No se inició una búsqueda de causas.");
      }
      await closeSweetAlerts(page);
      await closeBootstrapModals(page);
    }
    if (!(await form().count())) {
      const menu = page.getByRole("link", { name: /^Consulta Unificada$/i })
        .filter({ visible: true }).first();
      try {
        await menu.waitFor({ state: "visible", timeout });
        await menu.click({ timeout: 15_000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
      } catch {
        throw new PjudScrapeError("No se encontró o no se pudo abrir el acceso visible a Consulta Unificada en OJV. No se inició una búsqueda de causas.");
      }
    }
  }
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);
  await maybeSolveCaptchaOnPage(page, opts.signal);
  try {
    await form().waitFor({ state: "visible", timeout });
  } catch {
    throw new PjudScrapeError("OJV abrió Consulta Unificada pero no mostró el formulario de búsqueda. El portal puede requerir una validación o haber cambiado su estructura. No se inició una búsqueda de causas.");
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
  const sel = page.locator(`${OJV.competencia}:visible`).first();
  if ((await sel.count()) === 0) throw new PjudScrapeError("No está disponible el selector de competencia OJV.");
  await sel.selectOption(value);
  await delay(900);
}

async function readTribunalSelectOptions(
  page: PlaywrightPage,
  selector: string
) {
  await page
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
  await delay(500);
  return page.locator(`${selector}:visible`).first().locator("option").evaluateAll((arr) =>
    arr.map((o) => ({
      value: (o as HTMLOptionElement).value,
      label: (o.textContent || "").trim(),
    }))
  );
}

async function selectTribunalOrCorte(page: PlaywrightPage, tribunal: string) {
  const competencia = inferCompetenciaFromTribunal(tribunal);
  await selectCompetencia(page, competencia);

  if (competencia === "1") {
    // Corte Suprema: normalmente sin tribunal de 1ª instancia.
    return;
  }

  if (competencia === "2") {
    const corte = page.locator(`${OJV.corte}:visible`).first();
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
      .locator(`${OJV.tribunal}:visible`)
      .first();
    await trib.waitFor({ state: "visible", timeout: 12_000 });
    const options = await readTribunalSelectOptions(page, OJV.tribunal);
    const match = pickBestTribunalOption(options, tribunal);
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
    const state = window as typeof window & { lexopenConsulta?: { changed: boolean; observer: MutationObserver } };
    state.lexopenConsulta?.observer.disconnect();
    const results = "#resultConsultaJuridica, #resultConsultaCausa, #resultConsultaRol, #verDetalleJuridica";
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => {
        const parent = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return Boolean(parent?.closest(results)) || [...mutation.addedNodes].some((node) =>
          node instanceof Element && (node.matches(results) || node.querySelector(results))
        );
      }) && state.lexopenConsulta) state.lexopenConsulta.changed = true;
    });
    state.lexopenConsulta = { changed: false, observer };
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
            "#btnConConsultaJur, #btnConConsultaCausa, #btnConConsultaRol, #btnBuscar, button.btn-primary, button[type='submit'], input[type='submit']"
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
    await page.waitForFunction(() =>
      (window as typeof window & { lexopenConsulta?: { changed: boolean } }).lexopenConsulta?.changed,
      undefined,
      { timeout: responseTimeoutMs }
    );
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
  selector = "#verDetalleJuridica tr, #resultConsultaJuridica tr"
): Promise<string | null> {
  const rows = page.locator(selector);
  const snapshots = await rows.evaluateAll((nodes) => nodes.map((node) => {
    const el = node as HTMLElement;
    const visible = el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden" &&
      (el.tagName === "TR" || !el.querySelector("tr, .card, .list-group-item"));
    const cells = [...node.children].filter((child) => /^(TD|TH)$/.test(child.tagName));
    return {
      visible,
      cells: (cells.length ? cells : [...node.children]).map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim()),
    };
  }));
  const matches = snapshots.map((row, index) => ({ ...row, index }))
    .filter((row) => row.visible && causeRowMatches(row.cells, causa));
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
  const clicked = await row.evaluate((node) => {
    const icon = node.querySelector('img[src*="lupa" i], .glyphicon-search, .fa-search');
    const target = icon?.closest("a, button") || node.querySelector('a[title*="detalle" i], a[title*="ver" i], td a[onclick], td a, a[onclick], button');
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  });
  if (!clicked) throw new PjudScrapeError(`La fila exacta de ${causa.rit} no tiene un enlace de detalle reconocible.`);
  await page.locator(`:is(${OJV.modal}):visible`).first().waitFor({ state: "visible", timeout: 20_000 });
  if (staleDetails.length) {
    await page.waitForFunction((previous) => [...document.querySelectorAll(".modal")].some((node) =>
      (node as HTMLElement).getBoundingClientRect().height > 0 && !previous.includes(node.innerHTML)
    ), staleDetails, { timeout: 20_000 });
  }
  await delay(800);

  const hist = page.locator(
    `${OJV.modal}, .modal.in, .modal.show`
  ).locator(OJV.historiaTab);
  if ((await hist.count()) > 0) {
    await hist.first().click({ force: true }).catch(() => undefined);
    await delay(1200);
  }
  // Espera filas de historia / table-titulos
  await page
    .waitForSelector(
      '.modal.in table, .modal.show table, .modal.in table.table-titulos, .modal.show table.table-titulos',
      { timeout: 12_000 }
    )
    .catch(() => undefined);
  await delay(400);
  return pickTribunalFromTexts(matches[0].cells);
}

async function modalInnerHtml(page: PlaywrightPage) {
  const modal = page.locator(`:is(${OJV.modal}):visible`).first();
  return (await modal.count()) ? modal.innerHTML() : "";
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

async function scrapeModalTabs(
  page: PlaywrightPage
): Promise<PjudFetchedMovimiento[]> {
  const historyHtml = await modalInnerHtml(page);
  if (!historyHtml) throw new PjudScrapeError("El detalle OJV no está visible; no se extraerá el listado como historial.");
  let movimientos = parseMovimientosFromHtml(historyHtml);

  const receptor = page.locator(`:is(${OJV.modal}):visible`).first().locator(OJV.receptorTab).filter({ visible: true });
  if ((await receptor.count()) > 0) {
    await receptor.first().click().catch(() => undefined);
    await delay(700);
    const receptorHtml = await modalInnerHtml(page);
    const receptorMovs = parseMovimientosFromHtml(receptorHtml).map((m) => ({
      ...m,
      esReceptor: true,
      relevante: true,
      tipo: m.tipo === "otro" ? "notificacion" : m.tipo,
    }));
    movimientos = mergePjudMovimientos(movimientos, receptorMovs);
  }

  const escritos = page.locator(`:is(${OJV.modal}):visible`).first().locator(OJV.escritosTab).filter({ visible: true });
  if ((await escritos.count()) > 0) {
    await escritos.first().click().catch(() => undefined);
    await delay(700);
    const escritosHtml = await modalInnerHtml(page);
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

/**
 * Download OJV anexos with the authenticated Playwright session (cookies).
 * Bare `fetch()` after scrape usually hits a login wall HTML page.
 * Downloads are strictly sequential with a delay between requests.
 */
async function attachDocumentoBytesFromPage(
  page: PlaywrightPage,
  movimientos: PjudFetchedMovimiento[],
  opts?: { limit?: number; delayMs?: number }
): Promise<PjudFetchedMovimiento[]> {
  const {
    looksLikePdf,
    pjudDocDownloadDelayMs,
    pjudDocDownloadMaxPerRun,
  } = await import("@/lib/pjud/pdf-backup");
  const limit = opts?.limit ?? pjudDocDownloadMaxPerRun();
  const delayMs = opts?.delayMs ?? pjudDocDownloadDelayMs();
  let downloaded = 0;
  const out: PjudFetchedMovimiento[] = [];

  const isPjudHost = (href: string) => {
    try {
      const host = new URL(href).hostname.toLowerCase();
      return host === "pjud.cl" || host.endsWith(".pjud.cl");
    } catch {
      return false;
    }
  };

  for (const m of movimientos) {
    // The parser associates a download with its own table row. A global
    // folio/title substring cannot distinguish folio 1 from 11 or cuadernos.
    const ref = m.documentoRef || null;

    if (downloaded >= limit || !ref || !isPjudHost(ref)) {
      out.push({ ...m, documentoRef: ref || m.documentoRef });
      continue;
    }

    try {
      if (downloaded > 0 && delayMs > 0) {
        await delay(delayMs);
      }
      const res = await page.request.get(ref, { timeout: 35_000 });
      if (!res.ok()) {
        out.push({ ...m, documentoRef: ref });
        continue;
      }
      const buf = Buffer.from(await res.body());
      const ct = res.headers()["content-type"] || "";
      if (
        buf.byteLength >= 100 &&
        buf.byteLength <= 20 * 1024 * 1024 &&
        (looksLikePdf(buf) ||
          /pdf|msword|officedocument|octet-stream/i.test(ct)) &&
        !/^\s*</.test(buf.subarray(0, 40).toString("utf8"))
      ) {
        let filename = `folio-${m.folio || downloaded + 1}.pdf`;
        try {
          filename =
            new URL(ref).pathname.split("/").filter(Boolean).pop() || filename;
        } catch {
          /* keep */
        }
        out.push({
          ...m,
          documentoRef: ref,
          documentoBytes: buf,
          documentoFilename: filename,
        });
        downloaded += 1;
        continue;
      }
      out.push({ ...m, documentoRef: ref });
    } catch {
      out.push({ ...m, documentoRef: ref });
    }
  }
  return out;
}

async function fillRolSearchFields(
  page: PlaywrightPage,
  ritParts: NonNullable<ReturnType<typeof parseRitParts>>,
  tipoOverride?: string | null
) {
  const tipo = tipoOverride === undefined ? ritParts.tipo : tipoOverride;
  const fills: Array<[string, string]> = [
    [
      'input[id*="rit" i], input[name*="rit" i], input[id*="rol" i], input[name*="rol" i]',
      ritParts.numero,
    ],
    [
      'input[id*="era" i], input[name*="era" i], input[id*="ano" i], input[name*="ano" i]',
      ritParts.era,
    ],
  ];
  if (tipo) {
    fills.push([
      'input[id*="tipo" i], select[id*="tipo" i], input[name*="tipo" i], select[id*="rit" i]',
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
    await page.goto(OJV_HOME, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if ((await page.locator(OJV.captchaImg).count()) > 0) {
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
};

async function scrapeCausaByRolOnce(
  causa: PjudCausaRef,
  session: PjudSession,
  signal?: AbortSignal
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
    let movimientos = await scrapeModalTabs(page);
    if (movimientos.length > 0) {
      movimientos = await attachDocumentoBytesFromPage(page, movimientos);
    }

    const sala = parseSalaFromHtml(html);
    const withDocs = movimientos.filter((m) => m.documentoBytes).length;
    if (movimientos.length === 0 && !hasExplicitEmptyHistory(html)) {
      throw new PjudScrapeError(
        `El detalle de ${causa.rit} se abrió, pero no se reconoció su historial. No se crearán movimientos desde el listado. Portal: ${OJV_CONSULTA_URL}`
      );
    }

    return {
      movimientos,
      sala,
      note: `Scrape OJV (CAPTCHA/sesión): ${movimientos.length ? `${movimientos.length} movimiento(s)` : "OJV informó un historial sin movimientos"}${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}. No oficial; verifique en ${OJV_CONSULTA_URL}`,
      portalUrl: OJV_CONSULTA_URL,
      resolvedTribunal,
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
  if (!causa.rit || !parseRitParts(causa.rit) || isPlaceholderTribunal(causa.tribunal)) {
    throw new PjudScrapeError("Se requiere RIT/ROL válido y tribunal identificado para confirmar el expediente.", 400);
  }

  const cacheKey = `rol:${(causa.tribunal || "").toLowerCase()}:${(causa.rit || causa.ruc || "").toLowerCase()}`;
  const cached = cacheGet<ScrapeLookupResult>(cacheKey);
  if (cached) return { ...cached, note: `${cached.note} · cache` };

  let result: ScrapeLookupResult;
  try {
    const session = await getValidSession(signal);
    result = await scrapeCausaByRolOnce(causa, session, signal);
  } catch (error) {
    if (error instanceof PjudSessionExpiredError) {
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

async function openMisCausasMenu(page: AnyPage): Promise<boolean> {
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

async function clickMisCausasBuscar(page: AnyPage) {
  const buscar = page
    .getByRole("button", { name: /^Buscar$/i })
    .or(page.locator(OJV.misCausasBuscar))
    .first();
  if ((await buscar.count().catch(() => 0)) === 0) return false;
  if (!(await buscar.isVisible().catch(() => false))) {
    await buscar.click({ force: true, timeout: 8_000 }).catch(() => undefined);
  } else {
    await buscar.click({ timeout: 8_000 }).catch(() => undefined);
  }
  await sleep(1200);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  return true;
}

/** Abre solamente una fila con RIT y tribunal confirmados en Mis Causas. */
async function openMisCausasLupaForRit(
  page: PlaywrightPage,
  causa: { rit: string; tribunal: string }
): Promise<boolean> {
  return Boolean(await openExactCauseModal(page, causa, "tr, .card, .list-group-item"));
}

/** Follow visible, enabled next controls; repeated pages and truncation are errors. */
export async function collectOjvResultPages(
  page: PlaywrightPage,
  visitPage: () => Promise<boolean | void>
): Promise<boolean> {
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const signature = await page.locator("tr, .card, .list-group-item, .pagination, .dataTables_paginate").filter({ visible: true })
      .allTextContents().then((texts) => texts.join("\n"));
    if (seen.has(signature)) throw new PjudScrapeError("La paginación de OJV repitió una página. La consulta quedó incompleta; reintente.");
    seen.add(signature);
    if (await visitPage()) return true;
    const next = page
      .getByRole("link", { name: /^(Siguiente|Next|›|»)$/i })
      .or(page.getByRole("button", { name: /^(Siguiente|Next|›|»)$/i }))
      .or(page.locator('.pagination a[rel="next"], [aria-label="Next" i], [aria-label="Siguiente" i], .paginate_button.next, a.page-link:has-text("›")'))
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

async function applyMisCausasFiltros(page: AnyPage) {
  const filtros = page.getByRole("button", { name: /Filtros/i }).first();
  if (await filtros.isVisible().catch(() => false)) {
    await filtros.click().catch(() => undefined);
    await sleep(300);
  }
  // Manual OJV: Estado → Seleccionar Todos para no omitir concluidas.
  const estado = page
    .getByRole("button", { name: /^Estado$/i })
    .or(page.getByText(/^Estado$/i))
    .first();
  if (await estado.isVisible().catch(() => false)) {
    await estado.click().catch(() => undefined);
    await sleep(200);
  }
  const selectAll = page
    .getByText(/Seleccionar Todos|Seleccionar todos/i)
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

async function ensureAuthenticatedOjvShell(page: AnyPage): Promise<AnyPage> {
  await dismissOjvPrompts(page);
  const onOjv = /oficinajudicialvirtual\.pjud\.cl|ojv\.pjud\.cl/i.test(page.url());
  const needsShell =
    !onOjv || /return\.php|\/home\/index\.php|accounts\.claveunica/i.test(page.url());
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

async function collectMisCausasFromAuthenticatedOjv(
  page: AnyPage
): Promise<{ items: MisCausasItem[]; openedMenu: boolean; materiasTried: string[] }> {
  page = await ensureAuthenticatedOjvShell(page);

  const openedMenu = await openMisCausasMenu(page);
  const materiasTried: string[] = [];
  const all: MisCausasItem[] = [];
  const seen = new Set<string>();

  const pushParsed = async () => {
    const html = await pagesAndFramesHtml(page);
    for (const item of parseMisCausasItemsFromHtml(html)) {
      const key = `${item.rit}|${item.tribunal}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
  };

  await pushParsed();

  for (const materia of MIS_CAUSAS_MATERIAS) {
    const tab = page
      .getByRole("link", { name: new RegExp(`^${materia}$`, "i") })
      .or(page.getByRole("button", { name: new RegExp(`^${materia}$`, "i") }))
      .or(
        page.locator(
          `a:has-text("${materia}"), button:has-text("${materia}"), li:has-text("${materia}") > a, div.card:has-text("${materia}")`
        )
      )
      .first();
    if ((await tab.count().catch(() => 0)) === 0) continue;
    if (!(await tab.isVisible().catch(() => false))) {
      // Algunas materias están en acordeón colapsado.
      await tab.click({ force: true, timeout: 8_000 }).catch(() => undefined);
    } else {
      await tab.click({ timeout: 8_000 }).catch(() => undefined);
    }
    materiasTried.push(materia);
    await sleep(500);

    await applyMisCausasFiltros(page);
    await clickMisCausasBuscar(page);
    await collectOjvResultPages(page, pushParsed);
  }

  if (materiasTried.length === 0) {
    await applyMisCausasFiltros(page);
    await clickMisCausasBuscar(page);
    await collectOjvResultPages(page, pushParsed);
  }

  return { items: all, openedMenu, materiasTried };
}

/** True only for the OIDC login host — not the citizen marketing portal. */
export function isClaveUnicaAccountsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "accounts.claveunica.gob.cl";
  } catch {
    return false;
  }
}

/**
 * Abre el login OIDC real desde OJV.
 *
 * OJV tiene varios "Clave Única": el marketing (`https://claveunica.gob.cl/`)
 * y el OIDC (`AutenticaCUnica()` → submit `#cuform`). El selector genérico
 * `a[href*="claveunica"]` caía en el portal ciudadano y el login fallaba.
 */
async function openClaveUnicaFromOjv(page: AnyPage): Promise<AnyPage | null> {
  const waitForAccounts = async (): Promise<AnyPage | null> => {
    const popupPromise = page
      .context()
      .waitForEvent("page", { timeout: 8_000 })
      .catch(() => null);
    const navPromise = page
      .waitForURL(/accounts\.claveunica\.gob\.cl/i, { timeout: 45_000 })
      .catch(() => undefined);
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
      if (isClaveUnicaAccountsUrl(popup.url())) return popup;
    }
    await navPromise;
    if (isClaveUnicaAccountsUrl(page.url())) return page;
    return null;
  };

  const oidcStarted = await page
    .evaluate(() => {
      const w = window as unknown as { AutenticaCUnica?: () => void };
      if (typeof w.AutenticaCUnica === "function") {
        w.AutenticaCUnica();
        return "AutenticaCUnica";
      }
      const form = document.querySelector("#cuform") as HTMLFormElement | null;
      if (form) {
        form.submit();
        return "cuform";
      }
      return null;
    })
    .catch(() => null);

  if (oidcStarted) {
    const viaOidc = await waitForAccounts();
    if (viaOidc) return viaOidc;
  }

  const authLink = page
    .locator(
      'a[onclick*="AutenticaCUnica"], button[onclick*="AutenticaCUnica"], #cuform a, a:has-text("Clave Única")[href="#"], a:has-text("ClaveÚnica")[href="#"]'
    )
    .first();
  if ((await authLink.count()) > 0) {
    const popupPromise = page
      .context()
      .waitForEvent("page", { timeout: 8_000 })
      .catch(() => null);
    const navPromise = page
      .waitForURL(/accounts\.claveunica\.gob\.cl/i, { timeout: 45_000 })
      .catch(() => undefined);
    // El enlace OIDC suele estar oculto en el DOM; force evita el marketing visible.
    await authLink.click({ timeout: 10_000, force: true });
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
      if (isClaveUnicaAccountsUrl(popup.url())) return popup;
    }
    await navPromise;
    if (isClaveUnicaAccountsUrl(page.url())) return page;
  }

  // Último recurso: solo accounts.* (nunca claveunica.gob.cl marketing).
  const accountsLink = page
    .locator('a[href*="accounts.claveunica.gob.cl"]')
    .first();
  if ((await accountsLink.count()) > 0) {
    await accountsLink.click({ timeout: 10_000, force: true });
    await page
      .waitForURL(/accounts\.claveunica\.gob\.cl/i, { timeout: 45_000 })
      .catch(() => undefined);
    if (isClaveUnicaAccountsUrl(page.url())) return page;
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
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      captchaConfigErrorMessage() ||
        "CAPTCHA solver requerido para ClaveÚnica/OJV (CAPTCHA_SOLVER_PROVIDER + CAPTCHA_SOLVER_API_KEY).",
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
  if (!captchaSolverConfigured()) {
    throw new PjudScrapeError(
      captchaConfigErrorMessage() || "CAPTCHA solver requerido.",
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

    page = await ensureAuthenticatedOjvShell(page);
    await openMisCausasMenu(page);

    let opened = false;
    for (const materia of MIS_CAUSAS_MATERIAS) {
      const tab = page
        .getByRole("link", { name: new RegExp(`^${materia}$`, "i") })
        .or(page.getByRole("button", { name: new RegExp(`^${materia}$`, "i") }))
        .or(
          page.locator(
            `a:has-text("${materia}"), button:has-text("${materia}"), li:has-text("${materia}") > a`
          )
        )
        .first();
      if ((await tab.count().catch(() => 0)) === 0) continue;
      await tab
        .click({
          force: !(await tab.isVisible().catch(() => false)),
          timeout: 8_000,
        })
        .catch(() => undefined);
      await sleep(400);
      await applyMisCausasFiltros(page);
      await clickMisCausasBuscar(page);
      if (await collectOjvResultPages(page, () => openMisCausasLupaForRit(page, { rit: opts.causa.rit!, tribunal: opts.causa.tribunal || "" }))) {
        opened = true;
        break;
      }
    }
    if (!opened) {
      await applyMisCausasFiltros(page);
      await clickMisCausasBuscar(page);
      opened = await collectOjvResultPages(page, () => openMisCausasLupaForRit(page, { rit: opts.causa.rit!, tribunal: opts.causa.tribunal || "" }));
    }
    if (!opened) {
      throw new PjudScrapeError(
        `ClaveÚnica: no se encontró la lupa/detalle para ${opts.causa.rit} en Mis Causas.`
      );
    }

    const historyHtml = await modalInnerHtml(page as PlaywrightPage);
    let movimientos = await scrapeModalTabs(page as PlaywrightPage);
    movimientos = await attachDocumentoBytesFromPage(
      page as PlaywrightPage,
      movimientos
    );
    const html = await modalInnerHtml(page as PlaywrightPage);
    const sala = parseSalaFromHtml(html);
    const withDocs = movimientos.filter((m) => m.documentoBytes).length;
    if (movimientos.length === 0 && !hasExplicitEmptyHistory(historyHtml)) {
      throw new PjudScrapeError(
        `ClaveÚnica: modal abierto para ${opts.causa.rit} pero sin movimientos parseables (historia/cuaderno).`
      );
    }
    return {
      movimientos,
      sala,
      note: `Scrape Mis Causas (ClaveÚnica): ${movimientos.length ? `${movimientos.length} movimiento(s)` : "OJV informó un historial sin movimientos"}${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}.`,
      portalUrl: OJV_INDEX_N,
    };
  } finally {
    await browser.close();
  }
}

