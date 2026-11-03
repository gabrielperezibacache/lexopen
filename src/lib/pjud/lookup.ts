import { Prisma } from "@prisma/client";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { normalizarRut, validarRut } from "@/lib/chile";
import { scrapeCausaByRol, scrapeCausasByRut, publicScrapeReady } from "@/lib/pjud/public-scrape";
import { fetchFromScraperSidecar, buscarCausasByRutFromSidecar, scraperSidecarConfigured } from "@/lib/pjud/scraper-sidecar";
import { isPlaceholderTribunal, parseRitParts } from "@/lib/pjud/ojv-dom";
import { syncCausaPjud } from "@/lib/pjud/sync";
import { duplicateCausaWhere, type CausaOrigin } from "@/lib/pjud/causa-origin";
import type { MisCausasItem, PjudFetchResult } from "@/lib/pjud/types";

export type LookupCreateResult = {
  causaId: string; created: boolean;
  sync: Awaited<ReturnType<typeof syncCausaPjud>> | null;
  note: string; syncError?: string;
};

export function lookupIdentity(input: { rit: string; tribunal: string }) {
  const rit = input.rit.trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, "");
  const tribunal = input.tribunal.replace(/\s+/g, " ").trim();
  if (!parseRitParts(rit)) throw httpError("Use el RIT/ROL completo, por ejemplo C-123-2026 o 123-2026.", 400);
  if (tribunal.length < 3 || isPlaceholderTribunal(tribunal)) throw httpError("Indique el tribunal concreto de la causa; el RIT/ROL por sí solo no identifica el expediente.", 400);
  return { rit, tribunal };
}

/** Configuration only: a successful query is still required to check connectivity. */
export function lookupReadiness() {
  const sidecar = scraperSidecarConfigured(), direct = publicScrapeReady();
  return {
    configured: sidecar || direct,
    channel: sidecar ? "sidecar" as const : direct ? "browser" as const : "unconfigured" as const,
    note: sidecar || direct
      ? "El Host tiene un canal de consulta configurado. La conexión con la OJV se comprueba al consultar."
      : "La consulta OJV necesita preparación en Configuración → PJUD. Puede registrar la causa sin consultar y revisarla después.",
  };
}

/** Persist the matter independently of an optional, fallible online sync. */
export async function addCausaByRol(opts: {
  rit: string; tribunal: string; titulo?: string; ruc?: string | null; materia?: string;
  actorId?: string | null; syncNow?: boolean; origin?: CausaOrigin;
}): Promise<LookupCreateResult> {
  const { rit, tribunal } = lookupIdentity(opts);
  const actor = opts.actorId ? await prisma.user.findUniqueOrThrow({ where: { id: opts.actorId } }) : null;
  if (actor && !canSome(actor, "causa.create")) throw httpError("No puede crear causas", 403);
  const origin: CausaOrigin = opts.origin || "rol";
  async function persist() {
    return prisma.$transaction(async tx => {
      const existing = await tx.causa.findMany({
        where: duplicateCausaWhere({ rit, tribunal, ruc: opts.ruc })!,
        select: { id: true, pjudOrigin: true }, take: 2,
      });
      if (actor) for (const row of existing) await assertCausaCapability(row.id, actor, "causa.write", tx);
      if (existing.length > 1) throw httpError("Hay expedientes duplicados con estos datos. Revise la cartera antes de vincular la consulta.", 409);
      if (existing[0]) {
        const row = existing[0];
        await tx.causa.update({ where: { id: row.id }, data: { pjudMonitoreoActivo: true, ...(row.pjudOrigin ? {} : { pjudOrigin: origin }) } });
        return { causaId: row.id, created: false };
      }
      const row = await tx.causa.create({ data: {
        titulo: opts.titulo?.trim() || rit, rit, ruc: opts.ruc?.trim() || null,
        tribunal, materia: opts.materia || "Por clasificar", abogadoId: actor?.id || null,
        pjudMonitoreoActivo: true, pjudOrigin: origin, pjudSource: origin,
        pjudLastSyncStatus: "never", pjudLastSyncNote: "Causa registrada; la consulta OJV todavía no se ha confirmado.",
      } });
      return { causaId: row.id, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }
  let saved: { causaId: string; created: boolean };
  try { saved = await persist(); }
  catch (error) {
    // A serializable predicate prevents simultaneous registrations of the same identity.
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") saved = await persist();
    else throw error;
  }
  let sync: LookupCreateResult["sync"] = null, syncError: string | undefined;
  if (opts.syncNow !== false) {
    try { sync = await syncCausaPjud(saved.causaId, { actorId: opts.actorId, force: true, trigger: "manual" }); }
    catch { syncError = "La causa quedó guardada, pero su sincronización no pudo completarse. Puede reintentarla desde el expediente."; }
  }
  return { ...saved, sync, ...(syncError ? { syncError } : {}), note: saved.created
    ? `Causa ${rit} registrada con monitoreo activo.`
    : `Se vinculó el expediente existente ${rit}; su monitoreo está activo.` };
}

export async function buscarPorRut(rut: string, signal?: AbortSignal): Promise<MisCausasItem[]> {
  if (!validarRut(rut)) throw httpError("Revise el RUT del litigante y su dígito verificador.", 400);
  const normalized = normalizarRut(rut);
  signal?.throwIfAborted();
  if (scraperSidecarConfigured()) {
    try {
      const causas = await buscarCausasByRutFromSidecar(normalized, signal);
      if (causas !== null) return causas; // Empty is a response, not a reason to spend another query.
    } catch { signal?.throwIfAborted(); }
  }
  if (!publicScrapeReady()) throw httpError(lookupReadiness().configured
    ? "El servicio de consulta OJV no pudo responder. Revise su conexión en Configuración → PJUD y reintente."
    : lookupReadiness().note, 503);
  try { return await scrapeCausasByRut(normalized, signal); }
  catch { signal?.throwIfAborted(); throw httpError("No se pudo completar la búsqueda en OJV. No se registraron causas; conserve el RUT y vuelva a intentar.", 502); }
}

/** Query without creating a matter or enabling monitoring. Results may be a partial history. */
export async function previewRolLookup(opts: { rit: string; tribunal: string; ruc?: string | null; signal?: AbortSignal }) {
  const identity = lookupIdentity(opts), queriedAt = new Date().toISOString();
  const causaRef = { id: "preview", ...identity, ruc: opts.ruc || null, titulo: identity.rit, caratula: null };
  let result: PjudFetchResult | null = null;
  opts.signal?.throwIfAborted();
  if (scraperSidecarConfigured()) {
    try { result = await fetchFromScraperSidecar(causaRef, opts.signal); }
    catch { opts.signal?.throwIfAborted(); }
  }
  if (!result) {
    if (!publicScrapeReady()) throw httpError(lookupReadiness().configured
      ? "El servicio de consulta OJV no pudo responder. Revise la conexión o registre la causa sin consultar."
      : lookupReadiness().note, 503);
    try {
      const scraped = await scrapeCausaByRol(causaRef, opts.signal);
      result = { ...scraped, provider: "scrape", demo: false };
    } catch { opts.signal?.throwIfAborted(); throw httpError("No se pudo confirmar y leer esta causa en OJV. Revise el RIT/ROL y el tribunal, o vuelva a intentar si el portal no responde.", 502); }
  }
  return {
    identity, queriedAt, provider: result.provider, count: result.movimientos.length, sala: result.sala || null,
    note: result.movimientos.length ? "Consulta de lectura; aún no se ha registrado ni sincronizado la causa."
      : "La consulta no devolvió movimientos. Esto no confirma que el expediente carezca de actuaciones.",
    coverage: { scope: "returned-records" as const, complete: false as const, note: "La consulta muestra los movimientos recuperados y hasta cinco de ejemplo; no certifica una historia completa de la causa." },
    sample: result.movimientos.slice(0, 5).map(m => ({ titulo: m.titulo, fecha: m.fecha.toISOString().slice(0, 10), cuaderno: m.cuaderno, esReceptor: m.esReceptor })),
  };
}
