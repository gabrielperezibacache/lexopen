
import { BROWSER_UA, isPlaceholderTribunal, OJV, OJV_HOME, OJV_INDEX_N, OJV_POST_AUTH_URLS, parseRitParts, ritLabelsMatch, tribunalLabelsMatch } from "@/lib/pjud/ojv-dom";
import { hasExplicitEmptyHistory, parseMisCausasFromHtml, parseSalaFromHtml } from "@/lib/pjud/parse-html";

import { manualPjudInteractionActive } from "@/lib/pjud/manual-interaction-policy";
import type { MisCausasItem } from "@/lib/pjud/types";
import { type PjudCausaRef } from "@/lib/pjud/types";

import { cuadernosCoverageNote } from "@/lib/pjud/cuadernos-coverage";
import { isClaveUnicaAccountsUrl, startClaveUnicaOidcFromOjv, waitForOidcPageAfterTrigger } from "@/lib/pjud/ojv-oidc";
import { clearManualMisCausasRows, snapshotManualMisCausasRows, waitForFreshManualMisCausasRows } from "@/lib/pjud/manual-mis-causas-response";
import type { Locator } from "playwright";

import { collectOjvResultPages, publicScrapeEnabled, pjudPlaywrightInstallHint, playwrightAvailable, claveUnicaAutomationAllowed, PjudScrapeError, type PlaywrightPage, launchBrowser, assertPjudPromptPolicy, closeSweetAlerts, closeBootstrapModals, maybeSolveCaptchaOnPage, openExactCauseModal, modalInnerHtml, scrapeAllCuadernos, type ScrapeLookupResult } from "./public-browser";

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

