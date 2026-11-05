/** Product-owned temporary browser session; no vault, profile, cookie export or credentials. */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { OJV, OJV_HOME, ritLabelsMatch, tribunalLabelsMatch } from "@/lib/pjud/ojv-dom";
import {
  assertPjudPromptPolicy,
  CLAVEUNICA_PASSWORD_SELECTORS,
  CLAVEUNICA_RUT_SELECTORS,
  claveUnicaAutomationAllowed,
  collectMisCausasFromAuthenticatedOjv,
  MIS_CAUSAS_MATERIAS,
  openClaveUnicaFromOjv,
  publicScrapeEnabled,
  readCausaDetailFromAuthenticatedOjv,
  type MisCausasMateria,
  type MisCausasReadOptions,
  type ScrapeLookupResult,
} from "@/lib/pjud/public-scrape";
import { isClaveUnicaAccountsUrl, isOjvSessionUrl, redactedPjudValidationUrl } from "@/lib/pjud/ojv-oidc";
import type { MisCausasItem, PjudCausaRef } from "@/lib/pjud/types";
import { withManualPjudInteraction } from "@/lib/pjud/manual-interaction-policy";

type SessionPhase = "waiting-login" | "waiting-user-confirmation" | "authenticated" | "closed";
type ErrorCode = "disabled" | "manual-policy-required" | "login-unavailable" | "window-unavailable" | "not-authenticated" | "login-timeout" | "operation-timeout" | "session-closed" | "aborted" | "action-failed" | "cause-not-listed" | "invalid-materias" | "result-limit";

const messages: Record<ErrorCode, string> = {
  disabled: "La consulta OJV de esta sesión está deshabilitada.",
  "manual-policy-required": "La validación requiere confirmaciones y CAPTCHA manuales, con las descargas de documentos desactivadas.",
  "login-unavailable": "No se pudo abrir el formulario oficial de ClaveÚnica para esta sesión temporal.",
  "window-unavailable": "No se pudo activar la ventana oficial de esta conexión. Vuelva a intentarlo o abra una nueva conexión.",
  "not-authenticated": "Complete el ingreso manual y regrese a Mis Causas antes de continuar.",
  "login-timeout": "Terminó el tiempo disponible para completar el ingreso manual.",
  "operation-timeout": "La lectura OJV no terminó dentro del tiempo disponible.",
  "session-closed": "La sesión temporal OJV está cerrada.",
  aborted: "La sesión temporal OJV fue cancelada.",
  "action-failed": "No se pudo completar la lectura de la sesión OJV. Revise el navegador antes de reintentar.",
  "cause-not-listed": "El expediente solicitado no pertenece al listado comprobado de esta sesión.",
  "invalid-materias": "La selección de materias de Mis Causas no es válida.",
  "result-limit": "La respuesta supera el límite de esta sesión de validación.",
};

const diagnosticErrorNames = ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "TimeoutError", "AbortError", "PjudScrapeError"] as const;
type SessionReadOperation = "list" | "detail";
export type ManualOjvSessionDiagnostic = {
  operation: SessionReadOperation;
  originalErrorName: typeof diagnosticErrorNames[number] | "UnknownError";
  locations: string[];
};

function safeReadDiagnostic(operation: SessionReadOperation, error: unknown): ManualOjvSessionDiagnostic {
  let originalErrorName: ManualOjvSessionDiagnostic["originalErrorName"] = "UnknownError";
  let stack = "";
  try {
    if (error instanceof Error) {
      const name = error.name;
      if (diagnosticErrorNames.some(allowed => allowed === name)) originalErrorName = name as typeof diagnosticErrorNames[number];
      if (typeof error.stack === "string") stack = error.stack.slice(0, 65_536);
    }
  } catch { /* A malformed error cannot expand the diagnostic payload. */ }
  const locations = new Set<string>();
  for (const line of stack.split("\n").slice(0, 100)) {
    const frame = /^\s+at\s+(?:[^()\r\n]*\()?[^()\r\n]*?\bsrc[\\/]lib[\\/]pjud[\\/](public-scrape|manual-session|ojv-dom)\.ts:([1-9]\d{0,6}):([1-9]\d{0,6})\)?\s*$/.exec(line);
    if (frame) locations.add(`src/lib/pjud/${frame[1]}.ts:${frame[2]}:${frame[3]}`);
    if (locations.size === 4) break;
  }
  return { operation: operation === "detail" ? "detail" : "list", originalErrorName, locations: [...locations] };
}

export class ManualOjvSessionError extends Error {
  readonly diagnostic?: ManualOjvSessionDiagnostic;
  constructor(readonly code: ErrorCode, failure?: { operation: SessionReadOperation; error: unknown }) {
    super(messages[code]);
    this.name = "ManualOjvSessionError";
    if (failure) this.diagnostic = safeReadDiagnostic(failure.operation, failure.error);
  }
}

export type ManualOjvSessionOptions = {
  optedIn: boolean;
  /** Product UI owns its policy; validation CLI still requires the explicit environment switches. */
  manualInteraction?: boolean;
  signal?: AbortSignal;
  loginTimeoutMs?: number;
  operationTimeoutMs?: number;
  loginFormTimeoutMs?: number;
  /** Total lifetime, including idle time; never longer than 30 minutes. */
  maxLifetimeMs?: number;
};

export type ManualOjvSessionStatus = {
  phase: SessionPhase;
  authenticated: boolean;
  channel: "chrome" | "chromium";
  createdAt: string;
  authenticatedAt: string | null;
  pageUrl: string | null;
};

export type ManualOjvSession = {
  status(): ManualOjvSessionStatus;
  /** Optional for an already open session created before a Host development reload. */
  showOfficialWindow?(): Promise<void>;
  waitForAuthentication(): Promise<ManualOjvSessionStatus>;
  listMisCausas(options?: Pick<MisCausasReadOptions, "materias" | "responseTimeoutMs">): Promise<MisCausasItem[]>;
  fetchCausaDetail(causa: PjudCausaRef, options?: Pick<MisCausasReadOptions, "materias" | "responseTimeoutMs" | "downloadDocuments" | "excludeDocumentExternalIds" | "documentExternalIds">): Promise<ScrapeLookupResult>;
  /** Scope of the most recent list response; no case rows or account information. */
  lastListMaterias?(): readonly string[];
  close(): Promise<void>;
};

type OwnedContext = { browser: Browser; context: BrowserContext; channel: "chrome" | "chromium" };
/** Internal constructor seam for offline fixtures; not exposed by any HTTP endpoint. */
type SessionDependencies = { createOwnedContext?: () => Promise<OwnedContext> };

function assertRuntime(options: ManualOjvSessionOptions) {
  if (options.signal?.aborted) throw new ManualOjvSessionError("aborted");
  if (!options.optedIn || !publicScrapeEnabled() || !claveUnicaAutomationAllowed(true)) throw new ManualOjvSessionError("disabled");
  if (!options.manualInteraction && (process.env.PJUD_AUTO_CONFIRM_PROMPTS !== "0" || process.env.PJUD_CAPTCHA_AUTO_SOLVE !== "0" || process.env.PJUD_DOC_DOWNLOADS !== "0")) {
    throw new ManualOjvSessionError("manual-policy-required");
  }
}

function boundedMs(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 100), 15 * 60_000) : fallback;
}

function lifetimeMs(value: number | undefined) {
  const maximum = 30 * 60_000;
  return value !== undefined && Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 100), maximum) : maximum;
}

function checkedMaterias(materias?: readonly MisCausasMateria[]) {
  if (materias === undefined) return undefined;
  const allowed = new Set<string>([...MIS_CAUSAS_MATERIAS, "Corte Apelaciones"]);
  if (!materias.length || materias.length > allowed.size || materias.some(materia => !allowed.has(materia))) throw new ManualOjvSessionError("invalid-materias");
  return [...new Set(materias)];
}

async function createOwnedContext(): Promise<OwnedContext> {
  let browser: Browser;
  let channel: OwnedContext["channel"] = "chrome";
  try {
    browser = await chromium.launch({ headless: false, channel: "chrome", timeout: 30_000 });
  } catch {
    channel = "chromium";
    browser = await chromium.launch({ headless: false, timeout: 30_000 });
  }
  try {
    const context = await browser.newContext({ locale: "es-CL", viewport: { width: 1440, height: 900 } });
    return { browser, context, channel };
  } catch {
    await browser.close().catch(() => undefined);
    throw new ManualOjvSessionError("login-unavailable");
  }
}

async function identifiedPage(page: Page) {
  if (page.isClosed() || !isOjvSessionUrl(page.url())) return false;
  const identified = await page.evaluate(() => {
    const account = document.querySelector('a[href="#infousuario" i]');
    const passwordVisible = [...document.querySelectorAll('input[type="password"]')].some(input => input.getClientRects().length > 0);
    return !passwordVisible && Boolean(account && account.getClientRects().length && account.textContent?.trim() && !/^Invitado$/i.test(account.textContent.trim()));
  }).catch(() => false);
  return identified && Boolean(await page.locator(OJV.misCausasMenu).filter({ visible: true }).count().catch(() => 0));
}

class OwnedManualSession implements ManualOjvSession {
  private phase: SessionPhase = "waiting-login";
  private authenticatedPage: Page | null = null;
  private listed: MisCausasItem[] = [];
  private materiasTried: string[] = [];
  private readonly createdAt = new Date().toISOString();
  private authenticatedAt: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly abort = () => { void this.close(); };
  private readonly disconnected = () => {
    if (this.lifetimeTimer) clearTimeout(this.lifetimeTimer);
    this.lifetimeTimer = null;
    this.phase = "closed";
    this.authenticatedPage = null;
    this.listed = [];
    this.materiasTried = [];
  };
  private readonly contextClosed = () => { void this.close(); };

  constructor(private readonly owned: OwnedContext, private loginPage: Page, private readonly options: ManualOjvSessionOptions) {
    options.signal?.addEventListener("abort", this.abort, { once: true });
    owned.context.on("close", this.contextClosed);
    owned.browser.on("disconnected", this.disconnected);
    this.lifetimeTimer = setTimeout(() => { void this.close(); }, lifetimeMs(options.maxLifetimeMs));
  }

  status(): ManualOjvSessionStatus {
    const page = this.authenticatedPage || this.loginPage;
    return {
      phase: this.phase,
      authenticated: this.phase === "authenticated",
      channel: this.owned.channel,
      createdAt: this.createdAt,
      authenticatedAt: this.authenticatedAt,
      pageUrl: page.isClosed() ? null : redactedPjudValidationUrl(page.url()),
    };
  }

  loginOpened(page: Page) { this.loginPage = page; }
  lastListMaterias() { return [...this.materiasTried]; }

  async close() {
    if (this.closing) return this.closing;
    this.disconnected();
    this.options.signal?.removeEventListener("abort", this.abort);
    this.owned.context.off("close", this.contextClosed);
    this.owned.browser.off("disconnected", this.disconnected);
    this.closing = (async () => {
      await this.owned.context.close().catch(() => undefined);
      await this.owned.browser.close().catch(() => undefined);
    })();
    return this.closing;
  }

  private active() {
    assertRuntime(this.options);
    if (this.phase === "closed") throw new ManualOjvSessionError("session-closed");
  }

  /** Focusing must not wait behind a pending manual login in the read queue. */
  async showOfficialWindow() {
    this.active();
    const pages = this.owned.context.pages();
    const official = (page: Page) => !page.isClosed() && (isOjvSessionUrl(page.url()) || isClaveUnicaAccountsUrl(page.url()));
    const authenticated = this.authenticatedPage && pages.includes(this.authenticatedPage) && official(this.authenticatedPage) && await identifiedPage(this.authenticatedPage) ? this.authenticatedPage : null;
    this.active();
    const preferred = authenticated || (pages.includes(this.loginPage) && official(this.loginPage) ? this.loginPage : null);
    const page = preferred || [...pages].reverse().find(official);
    if (!page) throw new ManualOjvSessionError("window-unavailable");
    try { await page.bringToFront(); }
    catch { throw new ManualOjvSessionError("window-unavailable"); }
    this.active();
    if (!official(page)) throw new ManualOjvSessionError("window-unavailable");
  }

  private async serial<T>(work: () => Promise<T>, timeout: number, timeoutCode: "login-timeout" | "operation-timeout", operation?: SessionReadOperation): Promise<T> {
    const pending = this.queue.then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        this.active();
        return await Promise.race([
          withManualPjudInteraction(work),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { void this.close(); reject(new ManualOjvSessionError(timeoutCode)); }, timeout);
          }),
        ]);
      } catch (error) {
        if (this.options.signal?.aborted) throw new ManualOjvSessionError("aborted");
        if (error instanceof ManualOjvSessionError) {
          if (["disabled", "manual-policy-required", "aborted"].includes(error.code)) await this.close();
          throw error;
        }
        if (this.phase === "closed") throw new ManualOjvSessionError("session-closed");
        throw new ManualOjvSessionError("action-failed", operation ? { operation, error } : undefined);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  waitForAuthentication() {
    return this.serial(async () => {
      for (;;) {
        this.active();
        for (const page of this.owned.context.pages()) {
          if (!(await identifiedPage(page))) continue;
          try {
            await assertPjudPromptPolicy(page, true);
          } catch {
            this.phase = "waiting-user-confirmation";
            continue;
          }
          this.authenticatedPage = page;
          this.phase = "authenticated";
          this.authenticatedAt ||= new Date().toISOString();
          return this.status();
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }, boundedMs(this.options.loginTimeoutMs, 5 * 60_000), "login-timeout");
  }

  private async requireIdentifiedPage() {
    this.active();
    if (!this.authenticatedPage || !(await identifiedPage(this.authenticatedPage))) {
      this.phase = "waiting-login";
      this.authenticatedPage = null;
      this.listed = [];
      this.materiasTried = [];
      throw new ManualOjvSessionError("not-authenticated");
    }
    await assertPjudPromptPolicy(this.authenticatedPage, true);
    return this.authenticatedPage;
  }

  listMisCausas(options: Pick<MisCausasReadOptions, "materias" | "responseTimeoutMs"> = {}) {
    return this.serial(async () => {
      const page = await this.requireIdentifiedPage();
      const materias = checkedMaterias(options.materias);
      this.listed = [];
      this.materiasTried = [];
      const result = await collectMisCausasFromAuthenticatedOjv(page, { ...options, materias, allowPrompts: false, signal: this.options.signal });
      if (!result.openedMenu) throw new ManualOjvSessionError("not-authenticated");
      if (result.items.length > 2000) throw new ManualOjvSessionError("result-limit");
      this.listed = result.items.map(item => ({ ...item }));
      this.materiasTried = [...result.materiasTried];
      return result.items;
    }, boundedMs(this.options.operationTimeoutMs, 120_000), "operation-timeout", "list");
  }

  fetchCausaDetail(causa: PjudCausaRef, options: Pick<MisCausasReadOptions, "materias" | "responseTimeoutMs" | "downloadDocuments" | "excludeDocumentExternalIds" | "documentExternalIds"> = {}) {
    return this.serial(async () => {
      const page = await this.requireIdentifiedPage();
      if (!causa.rit || !this.listed.some(item => ritLabelsMatch(item.rit, causa.rit!) && tribunalLabelsMatch(item.tribunal, causa.tribunal))) {
        throw new ManualOjvSessionError("cause-not-listed");
      }
      return withManualPjudInteraction(() => readCausaDetailFromAuthenticatedOjv(page, causa, { ...options, materias: checkedMaterias(options.materias), allowPrompts: false, signal: this.options.signal }), { downloadDocuments: options.downloadDocuments === true });
    }, boundedMs(this.options.operationTimeoutMs, 120_000), "operation-timeout", "detail");
  }
}

export function createManualOjvSession(options: ManualOjvSessionOptions, dependencies: SessionDependencies = {}): Promise<ManualOjvSession> {
  return withManualPjudInteraction(() => createManualOjvSessionOwned(options, dependencies));
}

async function createManualOjvSessionOwned(options: ManualOjvSessionOptions, dependencies: SessionDependencies): Promise<ManualOjvSession> {
  assertRuntime(options);
  let owned: OwnedContext | undefined;
  let session: OwnedManualSession | undefined;
  try {
    owned = await (dependencies.createOwnedContext || createOwnedContext)();
    assertRuntime(options);
    const page = await owned.context.newPage();
    session = new OwnedManualSession(owned, page, options);
    await page.goto(OJV_HOME, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const login = await openClaveUnicaFromOjv(page);
    if (!login || !isClaveUnicaAccountsUrl(login.url())) throw new ManualOjvSessionError("login-unavailable");
    session.loginOpened(login);
    const formDeadline = Date.now() + boundedMs(options.loginFormTimeoutMs, 40_000);
    let formReady = false;
    while (Date.now() < formDeadline) {
      assertRuntime(options);
      if (login.isClosed() || !isClaveUnicaAccountsUrl(login.url())) break;
      const run = login.locator(CLAVEUNICA_RUT_SELECTORS).filter({ visible: true });
      const password = login.locator(CLAVEUNICA_PASSWORD_SELECTORS).filter({ visible: true });
      if (await run.count() && await password.count()) { formReady = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!formReady) throw new ManualOjvSessionError("login-unavailable");
    assertRuntime(options);
    await session.showOfficialWindow();
    return session;
  } catch (error) {
    if (session) await session.close();
    else if (owned) {
      await owned.context.close().catch(() => undefined);
      await owned.browser.close().catch(() => undefined);
    }
    if (error instanceof ManualOjvSessionError) throw error;
    throw new ManualOjvSessionError(options.signal?.aborted ? "aborted" : "login-unavailable");
  }
}
