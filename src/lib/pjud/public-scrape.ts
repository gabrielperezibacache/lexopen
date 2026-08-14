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
  isPlaceholderTribunal,
  OJV,
  OJV_CONSULTA_URL,
  OJV_HOME,
  OJV_INDEX_N,
  OJV_POST_AUTH_URLS,
  parseRitParts,
  pickBestTribunalOption,
  splitRut,
  tribunalLabelsMatch,
  type OjvCompetenciaValue,
} from "@/lib/pjud/ojv-dom";
import {
  parseCausasListFromHtml,
  parseMisCausasFromHtml,
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
        const loaders = document.querySelectorAll(
          "#loadPreJuridica, #loadPreCausa, .loadingConsulta"
        );
        if (!loaders.length) return true;
        return [...loaders].every((l) => (l as HTMLElement).innerHTML.trim() === "");
      },
      { timeout: 60_000 }
    )
    .catch(() => undefined);
}

async function selectCompetencia(
  page: PlaywrightPage,
  value: OjvCompetenciaValue
) {
  const sel = page.locator(OJV.competencia).first();
  if ((await sel.count()) === 0) return;
  await sel.selectOption(value).catch(() => undefined);
  await page.evaluate((v) => {
    const el = document.querySelector("#jurCompetencia") as HTMLSelectElement | null;
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await delay(900);
}

async function readTribunalSelectOptions(
  page: PlaywrightPage,
  selector: string
) {
  await page
    .waitForFunction(
      (sel) => {
        const s = document.querySelector(sel);
        return Boolean(s && s.querySelectorAll("option").length > 1);
      },
      selector,
      { timeout: 15_000 }
    )
    .catch(() => undefined);
  // OJV a veces rellena el select en 2 oleadas AJAX
  await delay(500);
  return page.$$eval(`${selector} option`, (arr) =>
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
    const corte = page.locator(OJV.corte).first();
    await corte.waitFor({ state: "visible", timeout: 12_000 }).catch(() => undefined);
    const options = await readTribunalSelectOptions(page, OJV.corte);
    const match = pickBestTribunalOption(options, tribunal);
    if (match) await corte.selectOption(match.value).catch(() => undefined);
    return;
  }

  if (["3", "4", "5", "6"].includes(competencia)) {
    // Prefer visible select in active tab (ROL vs Jurídica).
    const trib = page
      .locator(
        `.tab-pane.active ${OJV.tribunal}, .tab-content > .active ${OJV.tribunal}, ${OJV.tribunal}`
      )
      .first();
    await trib.waitFor({ state: "visible", timeout: 12_000 }).catch(() => undefined);
    const options = await readTribunalSelectOptions(page, OJV.tribunal);
    const match = pickBestTribunalOption(options, tribunal);
    if (match) {
      await trib.selectOption(match.value).catch(() => undefined);
      return;
    }
    // Fallback: label exact / contains via Playwright
    await trib.selectOption({ label: tribunal }).catch(() => undefined);
    // Último recurso: opción "Todos" / vacía amplia si existe
    const todos = options.find((o) =>
      /todos|todas|sin especificar|cualquiera/i.test(o.label)
    );
    if (todos) {
      await trib.selectOption(todos.value).catch(() => undefined);
    }
  }
}

/**
 * Click the active Consulta Unificada "Buscar".
 * `#btnConConsultaJur` often stays in the DOM on inactive Bootstrap tabs
 * (not visible) after switching to ROL/RIT — Playwright then times out.
 */
async function clickBuscar(page: PlaywrightPage) {
  await closeSweetAlerts(page);
  await closeBootstrapModals(page);

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
          if (!isBuscar || !visible(el)) continue;
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
      const any = page.locator(OJV.btnBuscarAny).first();
      if ((await any.count()) > 0) {
        await any.scrollIntoViewIfNeeded().catch(() => undefined);
        // force: last resort when OJV marks the control "not visible" but present
        await any.click({ force: true, timeout: 10_000 });
      } else {
        await page
          .locator(OJV.submit)
          .first()
          .click({ force: true })
          .catch(() => undefined);
      }
    }
  }

  await waitConsultaLoader(page);
}

async function openFirstCauseModal(page: PlaywrightPage, rit?: string | null) {
  const opened = await page.evaluate((wantRit) => {
    const want = (wantRit || "").toUpperCase().replace(/\s+/g, "");
    const rows = [
      ...document.querySelectorAll(
        "#verDetalleJuridica tr, #resultConsultaJuridica tr, table.table tr"
      ),
    ];
    for (const tr of rows) {
      if (tr.querySelector("nav") || tr.querySelector(".pagination")) continue;
      const text = (tr.textContent || "").toUpperCase().replace(/\s+/g, "");
      if (
        want &&
        !text.includes(want) &&
        !text.includes(want.replace(/^[A-ZÁÉÍÓÚÑ]+-/, ""))
      ) {
        continue;
      }
      const link =
        tr.querySelector<HTMLElement>("td a[onclick], td a") ||
        tr.querySelector<HTMLElement>(
          'a[title*="ver" i], a[title*="detalle" i], a[title*="lupa" i]'
        );
      if (link) {
        link.click();
        return true;
      }
      const icon = tr.querySelector(
        'img[src*="lupa" i], .glyphicon-search, .fa-search, i.fa-search'
      );
      if (icon) {
        const clickable =
          (icon.closest("a, button") as HTMLElement | null) ||
          (icon as HTMLElement);
        clickable.click();
        return true;
      }
    }
    // Fallback: first detail link in results table
    for (const tr of rows) {
      if (tr.querySelector("nav") || tr.querySelector(".pagination")) continue;
      const link = tr.querySelector<HTMLElement>("td a[onclick], td a");
      if (link) {
        link.click();
        return true;
      }
    }
    return false;
  }, rit || null);
  if (!opened) return false;

  await page
    .waitForFunction(() => {
      const mo = document.querySelector(
        '.modal.in, .modal.show, .modal[style*="display: block"]'
      );
      if (!mo) return false;
      const style = (mo as HTMLElement).style.display || "";
      return (
        style.includes("block") ||
        mo.classList.contains("in") ||
        mo.classList.contains("show")
      );
    }, { timeout: 20_000 })
    .catch(() => undefined);
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
  return true;
}

async function modalInnerHtml(page: PlaywrightPage) {
  return page.evaluate(() => {
    const mo = document.querySelector(
      '.modal.in, .modal.show, .modal[style*="display: block"]'
    );
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

  const extraLinks = await page
    .evaluate(() => {
      const mo = document.querySelector(
        '.modal.in, .modal.show, .modal[style*="display: block"]'
      );
      if (!mo) return [] as Array<{ href: string; hint: string }>;
      return [...mo.querySelectorAll("a[href]")].map((a) => ({
        href: (a as HTMLAnchorElement).href,
        hint: ((a.textContent || "") + " " + (a.closest("tr")?.innerText || ""))
          .replace(/\s+/g, " ")
          .slice(0, 240),
      }));
    })
    .catch(() => [] as Array<{ href: string; hint: string }>);

  for (const m of movimientos) {
    let ref = m.documentoRef || null;
    if (!ref || !/^https?:\/\//i.test(ref) || !isPjudHost(ref)) {
      const folio = (m.folio || "").trim();
      const hit = extraLinks.find((l) => {
        if (!isPjudHost(l.href)) return false;
        if (
          !/\.pdf(\?|$)|documento|descarg|ebook|anexo|escrito/i.test(
            `${l.href} ${l.hint}`
          )
        ) {
          return false;
        }
        if (folio && l.hint.includes(folio)) return true;
        const titleBit = m.titulo.slice(0, 24);
        return (
          titleBit.length > 6 &&
          l.hint.toLowerCase().includes(titleBit.toLowerCase())
        );
      });
      if (hit) ref = hit.href;
    }

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

async function extractEbookRef(page: PlaywrightPage): Promise<string | null> {
  return page.evaluate(() => {
    const mo = document.querySelector(
      '.modal.in, .modal.show, .modal[style*="display: block"]'
    );
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

async function consultaHasResultRows(page: PlaywrightPage) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll(
      "#verDetalleJuridica tr, #resultConsultaJuridica tr"
    );
    for (const tr of rows) {
      if (tr.querySelector("nav") || tr.querySelector(".pagination")) continue;
      if ((tr.textContent || "").trim().length > 8) return true;
    }
    return false;
  });
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
    const field = page.locator(sel).first();
    if ((await field.count()) === 0) continue;
    const tag = await field
      .evaluate((el) => el.tagName.toLowerCase())
      .catch(() => "");
    if (tag === "select") {
      await field
        .selectOption({ label: value })
        .catch(async () =>
          field.selectOption({ value }).catch(() => undefined)
        );
    } else {
      await field.fill(value).catch(() => undefined);
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

    const ritParts = causa.rit ? parseRitParts(causa.rit) : null;
    const inferred = inferCompetenciaFromTribunal(causa.tribunal || "");
    const unknownTribunal = isPlaceholderTribunal(causa.tribunal);
    const competencias: OjvCompetenciaValue[] = unknownTribunal
      ? (["3", "4", "6", "5", "2", "1"] as OjvCompetenciaValue[])
      : [inferred];
    // RIT sin letra (18390-2025): probar tipos frecuentes si el primero falla.
    const tipoTries: Array<string | null> = ritParts?.tipo
      ? [ritParts.tipo]
      : [null, "C", "F", "O", "T", "V", "E", "J"];

    const rolTab = page.locator(OJV.tabBusRol);
    let usedRolTab = false;
    let foundRows = false;

    if ((await rolTab.count()) > 0 && ritParts) {
      await rolTab.first().click().catch(() => undefined);
      await delay(400);
      usedRolTab = true;

      outer: for (const competencia of competencias) {
        await selectCompetencia(page, competencia);
        if (!unknownTribunal) {
          await selectTribunalOrCorte(page, causa.tribunal || "");
        }
        for (const tipo of tipoTries) {
          await fillRolSearchFields(page, ritParts, tipo);
          await clickBuscar(page);
          const noResults = await page.evaluate((needle) => {
            const d = document.querySelector("#resultConsultaJuridica");
            if (!d) return false;
            return (d.textContent || "").includes(needle);
          }, OJV.noResultsText);
          if (noResults) continue;
          if (await consultaHasResultRows(page)) {
            foundRows = true;
            break outer;
          }
        }
      }
    } else if (causa.ruc || causa.rit) {
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
      for (const competencia of competencias) {
        await selectCompetencia(page, competencia);
        if (!unknownTribunal) {
          await selectTribunalOrCorte(page, causa.tribunal || "");
        }
        await clickBuscar(page);
        const noResults = await page.evaluate((needle) => {
          const d = document.querySelector("#resultConsultaJuridica");
          if (!d) return false;
          return (d.textContent || "").includes(needle);
        }, OJV.noResultsText);
        if (noResults) continue;
        if (await consultaHasResultRows(page)) {
          foundRows = true;
          break;
        }
      }
    } else {
      await clickBuscar(page);
    }

    if (!foundRows) {
      const noResults = await page.evaluate((needle) => {
        const d = document.querySelector("#resultConsultaJuridica");
        if (!d) return false;
        return (d.textContent || "").includes(needle);
      }, OJV.noResultsText);
      if (noResults || !(await consultaHasResultRows(page))) {
        throw new PjudScrapeError(
          `Sin resultados OJV para ${causa.rit || causa.ruc}${
            unknownTribunal ? " (tribunal desconocido; se probaron varias competencias)" : ""
          }. Portal: ${OJV_CONSULTA_URL}`
        );
      }
    }

    let resolvedTribunal: string | null = null;
    if (causa.rit) {
      resolvedTribunal = await page.evaluate((rit) => {
        const want = rit.toUpperCase().replace(/\s+/g, "");
        const rows = document.querySelectorAll(
          "#verDetalleJuridica tr, #resultConsultaJuridica tr"
        );
        for (const tr of rows) {
          const text = (tr.textContent || "").toUpperCase().replace(/\s+/g, "");
          if (
            !text.includes(want) &&
            !text.includes(want.replace(/^[A-ZÁÉÍÓÚÑ]+-/, ""))
          ) {
            continue;
          }
          const cells = [...tr.querySelectorAll("td")].map((td) =>
            (td.textContent || "").replace(/\s+/g, " ").trim()
          );
          const trib = cells.find((c) =>
            /juzgado|corte|tribunal|garant|familia|laboral|cobranza|civil|penal/i.test(
              c
            )
          );
          const link = tr.querySelector("td a");
          if (link) (link as HTMLElement).click();
          return trib || null;
        }
        return null;
      }, causa.rit);
      await delay(700);
    }

    const modalOk = await openFirstCauseModal(page, causa.rit);
    let html = await page.content();
    if (modalOk) {
      const modalHtml = await modalInnerHtml(page);
      if (modalHtml) html = modalHtml;
    }

    let movimientos = modalOk
      ? await scrapeModalTabs(page)
      : parseMovimientosFromHtml(html);
    if (movimientos.length === 0) {
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

    if (modalOk && movimientos.length > 0) {
      movimientos = await attachDocumentoBytesFromPage(page, movimientos);
    }

    const sala = parseSalaFromHtml(html);
    const withDocs = movimientos.filter((m) => m.documentoBytes).length;
    if (movimientos.length === 0) {
      throw new PjudScrapeError(
        `Sin movimientos parseables para ${causa.rit || causa.ruc}${usedRolTab ? " (tab ROL)" : ""}${
          modalOk ? "" : " (no se abrió el detalle/modal)"
        }. Portal: ${OJV_CONSULTA_URL}`
      );
    }

    return {
      movimientos,
      sala,
      note: `Scrape OJV (CAPTCHA/sesión): ${movimientos.length} movimiento(s)${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}. No oficial; verifique en ${OJV_CONSULTA_URL}`,
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
    const url = page.url();
    const title = await page.title().catch(() => "");
    throw new PjudScrapeError(
      `No se encontró el campo RUN visible de ClaveÚnica (url=${String(url).slice(0, 140)}, título=${String(title).slice(0, 80)}). El sitio puede haber cambiado o bloquear automatización.`
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

/** Abre la lupa/detalle de una fila Mis Causas que coincida con el RIT. */
async function openMisCausasLupaForRit(page: AnyPage, rit: string): Promise<boolean> {
  const clicked = await page.evaluate((wantRaw: string) => {
    const want = wantRaw.toUpperCase().replace(/\s+/g, "");
    const bare = want.replace(/^[A-ZÁÉÍÓÚÑ]+-/, "");
    const nodes = [
      ...document.querySelectorAll("tr, .card, .list-group-item, .panel"),
    ];
    for (const row of nodes) {
      const text = (row.textContent || "").toUpperCase().replace(/\s+/g, "");
      if (!text.includes(want) && !text.includes(bare)) continue;
      const icon = row.querySelector(
        'img[src*="lupa" i], .glyphicon-search, .fa-search, i.fa-search, a[title*="ver" i], a[title*="detalle" i], a[title*="lupa" i]'
      );
      if (icon) {
        const el =
          (icon.closest("a, button") as HTMLElement | null) ||
          (icon as HTMLElement);
        el.click();
        return true;
      }
      const link = row.querySelector("td a, a[onclick]");
      if (link) {
        (link as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, rit);
  if (!clicked) return false;
  await sleep(1000);
  await page
    .waitForFunction(() => {
      const mo = document.querySelector(
        '.modal.in, .modal.show, .modal[style*="display: block"]'
      );
      return Boolean(mo);
    }, { timeout: 20_000 })
    .catch(() => undefined);
  const hist = page.locator(`.modal.in, .modal.show`).locator(OJV.historiaTab);
  if ((await hist.count()) > 0) {
    await hist.first().click({ force: true }).catch(() => undefined);
    await sleep(1200);
  }
  await page
    .waitForSelector(".modal.in table, .modal.show table", { timeout: 12_000 })
    .catch(() => undefined);
  return true;
}

/** Walk Mis Causas pagination while new RITs appear (cap 25 pages). */
async function collectMisCausasPages(
  page: AnyPage,
  pushParsed: () => Promise<void>,
  knownCount: () => number
) {
  for (let i = 0; i < 25; i++) {
    await pushParsed();
    const before = knownCount();
    const next = page
      .getByRole("link", { name: /^(Siguiente|Next|›|»)$/i })
      .or(
        page.locator(
          '.pagination a[rel="next"], .pagination li:not(.disabled) a:has-text("›"), .pagination li:not(.disabled) a:has-text("Siguiente"), a.page-link:has-text("›")'
        )
      )
      .first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click({ timeout: 8_000 }).catch(() => undefined);
    await sleep(900);
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
    await pushParsed();
    if (knownCount() <= before) break;
  }
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
    await collectMisCausasPages(page, pushParsed, () => all.length);
  }

  if (materiasTried.length === 0) {
    await applyMisCausasFiltros(page);
    await clickMisCausasBuscar(page);
    await collectMisCausasPages(page, pushParsed, () => all.length);
  }

  return { items: all, openedMenu, materiasTried };
}

/** True only for the OIDC login host — not the citizen marketing portal. */
export function isClaveUnicaAccountsUrl(url: string): boolean {
  return /accounts\.claveunica\.gob\.cl/i.test(url);
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
      const url = String(page.url()).slice(0, 160);
      const title = await page.title().catch(() => "");
      const stillLogin = isClaveUnicaAccountsUrl(url);
      throw new PjudScrapeError(
        stillLogin
          ? `El login de ClaveÚnica no llegó a OJV (url=${url}). Revise credenciales o CAPTCHA.`
          : [
              "Se autenticó en ClaveÚnica pero no se listaron causas en Mis Causas.",
              openedMenu
                ? `Menú Mis Causas abierto; materias probadas: ${materiasTried.join(", ") || "(ninguna visible)"}.`
                : "No se encontró el menú «Mis Causas» (sesión incompleta o layout distinto).",
              `url=${url}${title ? ` título=${title.slice(0, 60)}` : ""}.`,
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
  if (!opts.causa.rit) {
    throw new PjudScrapeError("Se requiere RIT para detalle ClaveÚnica.");
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
      if (await openMisCausasLupaForRit(page, opts.causa.rit)) {
        opened = true;
        break;
      }
    }
    if (!opened) {
      await applyMisCausasFiltros(page);
      await clickMisCausasBuscar(page);
      opened = await openMisCausasLupaForRit(page, opts.causa.rit);
    }
    if (!opened) {
      throw new PjudScrapeError(
        `ClaveÚnica: no se encontró la lupa/detalle para ${opts.causa.rit} en Mis Causas.`
      );
    }

    let movimientos = await scrapeModalTabs(page as PlaywrightPage);
    const ebook = await extractEbookRef(page as PlaywrightPage);
    if (ebook && movimientos[0] && !movimientos[0].documentoRef) {
      movimientos = movimientos.map((m, i) =>
        i === 0 ? { ...m, documentoRef: ebook } : m
      );
    }
    movimientos = await attachDocumentoBytesFromPage(
      page as PlaywrightPage,
      movimientos
    );
    const html = (await modalInnerHtml(page as PlaywrightPage)) || (await page.content());
    const sala = parseSalaFromHtml(html);
    const withDocs = movimientos.filter((m) => m.documentoBytes).length;
    if (movimientos.length === 0) {
      throw new PjudScrapeError(
        `ClaveÚnica: modal abierto para ${opts.causa.rit} pero sin movimientos parseables (historia/cuaderno).`
      );
    }
    return {
      movimientos,
      sala,
      note: `Scrape Mis Causas (ClaveÚnica): ${movimientos.length} movimiento(s)${withDocs ? ` · ${withDocs} PDF` : ""}${sala ? ` · ${sala}` : ""}.`,
      portalUrl: OJV_INDEX_N,
    };
  } finally {
    await browser.close();
  }
}

