/** Host-owned session state. Only opaque selections, never browser state, cross HTTP. */
import { randomUUID } from "node:crypto";
import { createManualOjvSession, ManualOjvSessionError, type ManualOjvSession } from "@/lib/pjud/manual-session";
import { ritLabelsMatch, tribunalLabelsMatch } from "@/lib/pjud/ojv-dom";
import type { MisCausasItem } from "@/lib/pjud/types";
import { syncMisCausas } from "@/lib/pjud/claveunica";
import { misCausasCapabilities } from "@/lib/pjud/mis-causas-access";
import { MANUAL_OJV_MATERIAS, type ManualOjvCandidate, type ManualOjvImportResult, type ManualOjvMateria, type ManualOjvUiSession } from "@/lib/pjud/manual-session-contract";

export const MANUAL_OJV_IMPORT_LIMIT = 20;
const LIFETIME_MS = 30 * 60_000;
export type ManualOjvOwner = { actorId: string; fingerprint: string; sessionVersion: number; authExpiresAt: number };
export class ManualOjvUiError extends Error {
  constructor(message: string, readonly status = 409) { super(message); this.name = "ManualOjvUiError"; }
}
type SyncResult = Awaited<ReturnType<typeof syncMisCausas>>;
type Dependencies = {
  createSession: typeof createManualOjvSession;
  sync: typeof syncMisCausas;
  authorize: (owner: ManualOjvOwner) => Promise<void>;
  runtimeAllowed: () => boolean;
  now: () => number;
  lifetimeMs: number;
  monitorMs: number;
};
type RecordState = {
  owner: ManualOjvOwner; view: ManualOjvUiSession; controller: AbortController;
  browser: ManualOjvSession | null; candidates: Map<string, MisCausasItem>;
  materias: ManualOjvMateria[] | undefined; monitor: ReturnType<typeof setInterval> | null;
  expiry: ReturnType<typeof setTimeout> | null; closing: Promise<void> | null;
  operation: "listing" | "importing" | null;
};
export type ManualOjvPendingAction = { session: ManualOjvUiSession; run: () => Promise<void> };

export function manualOjvRuntimeEnabled(env: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform) {
  const optIn = env.PJUD_MANUAL_SESSION === "1" || env.LEXOPEN_DESKTOP === "1" && env.LEXOPEN_DESKTOP_MODE === "host";
  return optIn && (platform !== "linux" || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY)) && env.PJUD_PUBLIC_SCRAPE === "1" && env.PJUD_CLAVEUNICA_SCRAPE?.trim() !== "0";
}

async function authorize(owner: ManualOjvOwner) {
  const { prisma } = await import("@/lib/db");
  const { mustEnrollTwoFactor } = await import("@/lib/auth/two-factor-policy");
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: owner.actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true, sessionVersion: true, totpEnabled: true } }),
    prisma.firmSettings.findFirst({ select: { require2faPrivileged: true } }),
  ]);
  if (!user || user.sessionVersion !== owner.sessionVersion || !misCausasCapabilities(user).sync || mustEnrollTwoFactor({ role: user.role, totpEnabled: user.totpEnabled, policyEnabled: settings?.require2faPrivileged ?? true })) {
    throw new ManualOjvUiError("La autorización cambió. Cierre esta conexión y vuelva a ingresar en LexOpen.", 403);
  }
}

function message(error: unknown) {
  if (error instanceof ManualOjvUiError) return error.message;
  if (error instanceof ManualOjvSessionError) return error.message;
  return "No se pudo completar la operación de OJV. Revise la cartera antes de reintentar; algunas causas pueden haber quedado guardadas.";
}
function sameOwner(a: ManualOjvOwner, b: ManualOjvOwner) {
  return a.actorId === b.actorId && a.fingerprint === b.fingerprint && a.sessionVersion === b.sessionVersion && a.authExpiresAt === b.authExpiresAt;
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** One visible browser per Host, privately owned by one authenticated LexOpen session. */
export class ManualOjvSessionManager {
  private readonly records = new Map<string, RecordState>();
  private readonly latest = new Map<string, string>();
  private activeId: string | null = null;
  private readonly deps: Dependencies;
  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { createSession: createManualOjvSession, sync: syncMisCausas, authorize, runtimeAllowed: manualOjvRuntimeEnabled, now: Date.now, lifetimeMs: LIFETIME_MS, monitorMs: 5_000, ...deps };
  }

  private async active(record: RecordState) {
    try {
      if (record.controller.signal.aborted || record.view.phase === "closed" || this.deps.now() >= Date.parse(record.view.expiresAt)) throw new ManualOjvUiError("La conexión temporal terminó. Abra una nueva ventana de ingreso.");
      if (this.deps.now() >= record.owner.authExpiresAt) throw new ManualOjvUiError("Su sesión de LexOpen terminó. Vuelva a ingresar.", 401);
      if (!this.deps.runtimeAllowed()) throw new ManualOjvUiError("El ingreso manual está deshabilitado en este Host.", 503);
      await this.deps.authorize(record.owner);
      if (record.controller.signal.aborted || this.deps.now() >= Date.parse(record.view.expiresAt) || this.deps.now() >= record.owner.authExpiresAt) throw new ManualOjvUiError("La conexión temporal terminó mientras se comprobaba su autorización.");
    } catch (error) { await this.closeRecord(record); throw error; }
  }

  private async owned(owner: ManualOjvOwner, id?: string) {
    const key = id ?? this.latest.get(owner.actorId);
    if (!key) return null;
    const record = this.records.get(key);
    if (!record || record.owner.actorId !== owner.actorId) throw new ManualOjvUiError("La conexión no está disponible para esta sesión.", 404);
    if (!sameOwner(record.owner, owner)) {
      if (id) throw new ManualOjvUiError("La conexión no está disponible para esta sesión.", 404);
      return null;
    }
    try {
      if (record.view.phase !== "closed") await this.active(record);
      else {
        if (this.deps.now() >= owner.authExpiresAt) throw new ManualOjvUiError("Su sesión de LexOpen terminó. Vuelva a ingresar.", 401);
        await this.deps.authorize(owner);
      }
    }
    catch (error) { await this.closeRecord(record); throw error; }
    return record;
  }

  private snapshot(record: RecordState) {
    const view = copy(record.view);
    const phase = record.browser?.status().phase;
    view.authenticated = Boolean(record.browser?.status().authenticated);
    if (view.phase === "waiting-login" && phase === "waiting-user-confirmation") view.phase = "waiting-user-confirmation";
    return view;
  }

  private browser(record: RecordState) {
    if (record.controller.signal.aborted || !record.browser) throw new ManualOjvUiError("La conexión temporal fue cerrada.");
    return record.browser;
  }

  private forget(record: RecordState) {
    if (record.expiry) clearTimeout(record.expiry);
    this.records.delete(record.view.id);
    if (this.latest.get(record.owner.actorId) === record.view.id) this.latest.delete(record.owner.actorId);
  }

  async status(owner: ManualOjvOwner, id?: string) {
    const record = await this.owned(owner, id);
    if (!record) return null;
    if (record.browser?.status().phase === "closed") await this.closeRecord(record);
    return this.snapshot(record);
  }

  private async closeRecord(record: RecordState) {
    if (record.closing) return record.closing;
    if (record.view.phase === "importing" && !record.view.result) record.view.error = "La importación se detuvo. Las causas ya guardadas se conservan; revise la cartera antes de reintentar.";
    record.controller.abort();
    record.view.phase = "closed";
    record.view.authenticated = false;
    record.view.candidates = [];
    record.candidates.clear();
    record.view.progress = null;
    record.operation = null;
    if (record.monitor) clearInterval(record.monitor);
    record.monitor = null;
    record.closing = (async () => {
      await record.browser?.close().catch(() => undefined);
      record.browser = null;
      if (this.activeId === record.view.id) this.activeId = null;
    })();
    return record.closing;
  }

  async close(owner: ManualOjvOwner, id?: string) {
    // Release a matching owner's resources even if their import capability was revoked.
    const key = id ?? this.latest.get(owner.actorId);
    const record = key ? this.records.get(key) : null;
    if (!record || !sameOwner(record.owner, owner)) throw new ManualOjvUiError("La conexión no está disponible para esta sesión.", 404);
    await this.closeRecord(record);
    return this.snapshot(record);
  }

  async start(owner: ManualOjvOwner): Promise<ManualOjvPendingAction> {
    if (this.deps.now() >= owner.authExpiresAt || !this.deps.runtimeAllowed()) throw new ManualOjvUiError("El ingreso manual requiere una sesión vigente en el Host local.", 403);
    await this.deps.authorize(owner);
    const current = await this.owned(owner);
    if (current && current.view.phase !== "closed" && current.browser?.status().phase !== "closed") {
      if (current.browser && !current.browser.status().authenticated && ["ready", "completed", "error"].includes(current.view.phase) && !current.operation) {
        current.view.phase = "waiting-login"; current.view.error = null; current.view.candidates = []; current.candidates.clear(); current.view.listedAt = null; current.view.materiasTried = [];
        let started = false;
        return { session: this.snapshot(current), run: async () => {
          if (started) return; started = true;
          try { await this.active(current); await this.browser(current).waitForAuthentication(); await this.active(current); current.view.phase = "ready"; }
          catch (error) { if (!current.controller.signal.aborted) current.view.error = message(error); await this.closeRecord(current); }
        } };
      }
      return { session: this.snapshot(current), run: async () => undefined };
    }
    if (current) {
      await this.closeRecord(current);
      this.forget(current);
    }
    if (this.activeId) {
      const opening = this.records.get(this.activeId);
      if (opening && sameOwner(opening.owner, owner)) return { session: this.snapshot(opening), run: async () => undefined };
      if (opening?.owner.actorId === owner.actorId) {
        // A deliberate start can replace this professional's old authentication.
        // A stale tab's read-only poll must never close the newer connection.
        await this.closeRecord(opening);
        this.forget(opening);
      }
    }
    if (this.activeId) {
      const opening = this.records.get(this.activeId);
      if (opening && sameOwner(opening.owner, owner)) return { session: this.snapshot(opening), run: async () => undefined };
      throw new ManualOjvUiError("Ya hay una ventana de ingreso manual en uso en este Host. Cierre esa conexión antes de abrir otra.");
    }
    if (this.records.size >= 8) throw new ManualOjvUiError("Hay demasiadas conexiones temporales recientes. Espere a que terminen o vuelva a intentarlo en unos minutos.", 429);
    const id = randomUUID();
    const view: ManualOjvUiSession = { id, phase: "opening", expiresAt: new Date(this.deps.now() + Math.min(this.deps.lifetimeMs, LIFETIME_MS)).toISOString(), authenticated: false, listedAt: null, materiasTried: [], candidates: [], progress: null, result: null, error: null };
    const record: RecordState = { owner: { ...owner }, view, controller: new AbortController(), browser: null, candidates: new Map(), materias: undefined, monitor: null, expiry: null, closing: null, operation: null };
    this.records.set(id, record); this.latest.set(owner.actorId, id); this.activeId = id;
    record.expiry = setTimeout(() => {
      void this.closeRecord(record).finally(() => {
        this.forget(record);
      });
    }, Math.max(1, Date.parse(view.expiresAt) - this.deps.now()));
    record.expiry.unref();
    let checking = false;
    record.monitor = setInterval(() => {
      if (checking || record.view.phase === "closed") return;
      checking = true;
      void this.active(record).then(async () => { if (record.browser?.status().phase === "closed") await this.closeRecord(record); }).catch(() => this.closeRecord(record)).finally(() => { checking = false; });
    }, this.deps.monitorMs);
    record.monitor.unref();
    let started = false;
    return { session: this.snapshot(record), run: async () => {
      if (started) return; started = true;
      try {
        await this.active(record);
        const browser = await this.deps.createSession({ optedIn: true, manualInteraction: true, signal: record.controller.signal, loginTimeoutMs: 15 * 60_000, operationTimeoutMs: 240_000, maxLifetimeMs: Math.max(100, Date.parse(record.view.expiresAt) - this.deps.now()) });
        if (record.controller.signal.aborted) { await browser.close(); throw new ManualOjvUiError("La apertura de la ventana fue cancelada."); }
        record.browser = browser;
        await this.active(record);
        record.view.phase = "waiting-login";
        await browser.waitForAuthentication();
        await this.active(record);
        record.view.phase = "ready";
      } catch (error) {
        if (!record.controller.signal.aborted) record.view.error = message(error);
        await this.closeRecord(record);
      }
    } };
  }

  private async available(owner: ManualOjvOwner, id: string, operation: "listing" | "importing") {
    const record = await this.owned(owner, id);
    if (!record?.browser || record.operation || !record.browser.status().authenticated || !["ready", "completed", "error"].includes(record.view.phase)) throw new ManualOjvUiError("Complete el ingreso en la ventana oficial y espere a que termine la operación actual.");
    record.operation = operation;
    return record;
  }

  async list(owner: ManualOjvOwner, id: string, materias?: ManualOjvMateria[]): Promise<ManualOjvPendingAction> {
    const record = await this.available(owner, id, "listing");
    record.view.phase = "listing"; record.view.error = null; record.view.listedAt = null; record.view.candidates = []; record.candidates.clear(); record.view.progress = null;
    record.materias = materias ? [...new Set(materias)] : undefined;
    record.view.materiasTried = [];
    let started = false;
    return { session: this.snapshot(record), run: async () => {
      if (started) return; started = true;
      try {
        await this.active(record);
        const browser = this.browser(record);
        const items = await browser.listMisCausas({ materias: record.materias });
        await this.active(record);
        record.view.materiasTried = (browser.lastListMaterias?.() ?? record.materias ?? []).map(value => value === "Corte Apelaciones" ? "Apelaciones" : value).filter((value): value is ManualOjvMateria => MANUAL_OJV_MATERIAS.some(materia => materia === value));
        if (items.length > 2_000) throw new ManualOjvUiError("La respuesta supera el límite de lectura. Seleccione una materia y vuelva a consultar.");
        for (const item of items) {
          const candidate: ManualOjvCandidate = { id: randomUUID(), rit: item.rit.slice(0, 100), tribunal: item.tribunal.slice(0, 300), caratula: item.caratula?.slice(0, 500) || null, estado: item.estado?.slice(0, 100) || null };
          record.candidates.set(candidate.id, { ...item }); record.view.candidates.push(candidate);
        }
        record.view.listedAt = new Date(this.deps.now()).toISOString(); record.view.phase = "ready";
      } catch (error) {
        if (!record.controller.signal.aborted) { record.view.phase = "error"; record.view.error = message(error); }
      } finally { record.operation = null; }
    } };
  }

  async import(owner: ManualOjvOwner, id: string, ids: string[]): Promise<ManualOjvPendingAction> {
    const record = await this.available(owner, id, "importing");
    if (!ids.length || ids.length > MANUAL_OJV_IMPORT_LIMIT || new Set(ids).size !== ids.length) { record.operation = null; throw new ManualOjvUiError(`Seleccione entre 1 y ${MANUAL_OJV_IMPORT_LIMIT} causas distintas por operación.`, 400); }
    if (!record.view.listedAt || ids.some(key => !record.candidates.has(key))) { record.operation = null; throw new ManualOjvUiError("La selección no pertenece al último listado consultado en esta conexión.", 400); }
    const selected = ids.map(key => ({ ...record.candidates.get(key)! }));
    record.view.phase = "importing"; record.view.error = null; record.view.result = null;
    record.view.progress = { completed: 0, total: selected.length };
    let started = false;
    return { session: this.snapshot(record), run: async () => {
      if (started) return; started = true;
      try {
        const result = await this.deps.sync({ actorId: owner.actorId, processJobsInline: true, sessionSource: {
          assertActive: () => this.active(record), downloadDocuments: false,
          listMisCausas: async () => {
            await this.active(record);
            const current = await this.browser(record).listMisCausas({ materias: record.materias });
            await this.active(record);
            return selected.map(item => {
              const fresh = current.find(row => ritLabelsMatch(row.rit, item.rit) && tribunalLabelsMatch(row.tribunal, item.tribunal));
              if (!fresh) throw new ManualOjvUiError("Una causa seleccionada ya no aparece en la nueva respuesta de OJV. Consulte nuevamente antes de importar.");
              return fresh;
            });
          },
          fetchMovimientos: async causa => {
            await this.active(record);
            const browser = this.browser(record);
            if (record.view.progress) record.view.progress.currentRit = causa.rit || undefined;
            try {
              const detail = await browser.fetchCausaDetail(causa, { materias: record.materias });
              await this.active(record);
              return { ...detail, provider: "scrape", demo: false };
            } finally {
              if (record.view.progress) { record.view.progress.completed += 1; delete record.view.progress.currentRit; }
            }
          },
        } });
        await this.active(record);
        record.view.result = this.importResult(result);
        record.view.progress = { completed: selected.length, total: selected.length };
        record.view.phase = "completed";
      } catch (error) {
        if (!record.controller.signal.aborted) { record.view.phase = "error"; record.view.error = message(error); }
      } finally { record.operation = null; }
    } };
  }

  private importResult(result: SyncResult): ManualOjvImportResult {
    return {
      created: result.created, linked: result.linked, syncOk: result.syncOk, syncFailed: result.syncFailed, syncPartial: result.syncPartial, inserted: result.inserted,
      items: result.items.map(item => {
        const sync = result.syncResults.find(row => row.causaId === item.causaId);
        return { causaId: item.causaId, rit: item.rit, tribunal: item.tribunal, status: sync?.status || "failed", ...(sync?.note ? { note: sync.note } : {}), ...(sync?.cuadernosCoverage ? { cuadernosCoverage: sync.cuadernosCoverage } : {}) };
      }),
    };
  }

  async dispose() {
    for (const record of this.records.values()) { if (record.expiry) clearTimeout(record.expiry); await this.closeRecord(record); }
    this.records.clear(); this.latest.clear();
  }
}

const host = globalThis as typeof globalThis & { lexopenManualOjvSessions?: ManualOjvSessionManager };
export const manualOjvSessions = host.lexopenManualOjvSessions ??= new ManualOjvSessionManager();
