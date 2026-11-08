import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizarRut, validarRut } from "@/lib/chile";
import { causaAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";

export type ConflictHit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
  /** active = causa abierta; recent_closed = cerrada en ventana reciente */
  source?: "active" | "recent_closed" | "cliente";
};

export type ConflictCheckResult = {
  conflicts: ConflictHit[];
  hasRestrictedMatch: boolean;
  status: "clear" | "warning" | "blocked";
  notice?: string;
  coverageLimited?: boolean;
};

/** Preserve the risk decision without exposing a hidden identity or hit count. */
export function sanitizeConflictHits(hits: ConflictHit[], visibleIds: ReadonlySet<string>): ConflictCheckResult {
  const conflicts = hits.filter((hit) => visibleIds.has(hit.causaId));
  const hasRestrictedMatch = hits.some((hit) => !visibleIds.has(hit.causaId));
  return { conflicts, hasRestrictedMatch, status: summarizeConflictStatus(hits),
    ...(hasRestrictedMatch ? { notice: "Coincidencia reservada: requiere revisión de un socio autorizado" } : {}),
  };
}

export function labelConflictStatus(status: string | null | undefined) {
  const map: Record<string, string> = {
    clear: "sin hallazgos",
    warning: "advertencia",
    blocked: "bloqueante",
    idle: "sin revisar",
  };
  return map[status || ""] || status || "—";
}

export function labelConflictSeverity(severity: string | null | undefined) {
  const map: Record<string, string> = {
    warning: "advertencia",
    blocked: "bloqueante",
  };
  return map[severity || ""] || severity || "—";
}

function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(s: string) {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t.length >= 3);
}

/** Overlap of significant tokens (≥2 shared, or one contains the other). */
export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Containment only for substantial strings (avoid "Ana" ⊂ "Ana María").
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 6 && longer.includes(shorter)) return true;
  const ta = new Set(nameTokens(a));
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.length === 0) return false;
  let shared = 0;
  for (const t of tb) if (ta.has(t)) shared += 1;
  if (shared >= 2) return true;
  // Single shared token only when both sides are multi-token names.
  return shared === 1 && ta.size >= 2 && tb.length >= 2;
}

/** Compare complete identifiers; only genuine Chilean RUTs have formatting aliases. */
export function partyIdentifiersMatch(left: string | null | undefined, right: string | null | undefined) {
  if (!left?.trim() || !right?.trim()) return false;
  const strictRut = (value: string) => /^(?:\d{7,8}|\d{1,2}\.\d{3}\.\d{3})[-\u2010-\u2015\u2212]?[\dK]$/i.test(value.trim()) && validarRut(value);
  if (strictRut(left) && strictRut(right)) return normalizarRut(left) === normalizarRut(right);
  return left.trim().normalize("NFKC").toUpperCase() === right.trim().normalize("NFKC").toUpperCase();
}

const RECENT_CLOSED_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

/** Busca conflictos por nombre o identificación en causas activas y cerradas recientes. */
export async function checkConflicts(opts: {
  client?: Prisma.TransactionClient;
  partes: Array<{ nombre: string; rut?: string | null }>;
  excludeCausaId?: string;
  user?: CausaAccessUser;
}): Promise<ConflictCheckResult> {
  const db = opts.client || prisma;
  const hits: ConflictHit[] = [];
  const closedAfter = new Date(Date.now() - RECENT_CLOSED_MS);

  const causas = await db.causa.findMany({
    where: {
      OR: [
        { estado: { in: ["activa", "suspensa"] } },
        {
          estado: { in: ["terminada", "archivada"] },
          updatedAt: { gte: closedAfter },
        },
      ],
      ...(opts.excludeCausaId ? { id: { not: opts.excludeCausaId } } : {}),
    },
    include: { partes: true, cliente: true },
    take: 800,
    orderBy: { updatedAt: "desc" },
  });

  for (const parte of opts.partes) {
    const nombre = parte.nombre.trim();
    const identifier = parte.rut?.trim() || null;
    for (const c of causas) {
      const isActive = c.estado === "activa" || c.estado === "suspensa";
      const source: ConflictHit["source"] = isActive
        ? "active"
        : "recent_closed";

      for (const p of c.partes) {
        const sameIdentifier = partyIdentifiersMatch(identifier, p.rut);
        const sameName = namesLikelyMatch(nombre, p.nombre);
        if (sameIdentifier || sameName) {
          const severity: ConflictHit["severity"] =
            sameIdentifier && isActive ? "blocked" : "warning";
          hits.push({
            causaId: c.id,
            titulo: c.titulo,
            rit: c.rit,
            match: sameIdentifier
              ? `Identificación ${identifier} ya figura en ${c.rit || c.titulo}${
                  isActive ? "" : " (causa cerrada reciente)"
                }`
              : `Nombre similar «${p.nombre}» en ${c.rit || c.titulo}${
                  isActive ? "" : " (causa cerrada reciente)"
                }`,
            severity,
            source,
          });
        }
      }

      if (partyIdentifiersMatch(identifier, c.cliente?.rut)) {
        hits.push({
          causaId: c.id,
          titulo: c.titulo,
          rit: c.rit,
          match: `Cliente con identificación ${identifier} en causa ${c.rit || c.titulo}`,
          severity: "warning",
          source: "cliente",
        });
      }

      if (
        c.cliente?.razonSocial &&
        namesLikelyMatch(nombre, c.cliente.razonSocial)
      ) {
        hits.push({
          causaId: c.id,
          titulo: c.titulo,
          rit: c.rit,
          match: `Cliente «${c.cliente.razonSocial}» similar en ${
            c.rit || c.titulo
          }`,
          severity: "warning",
          source: "cliente",
        });
      }
    }
  }

  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const k = `${h.causaId}:${h.match}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const allowed = opts.user && unique.length ? await db.causa.findMany({
    where: { AND: [causaAccessWhere(opts.user), { id: { in: [...new Set(unique.map((hit) => hit.causaId))] } }] },
    select: { id: true },
  }) : [];
  const result = sanitizeConflictHits(unique, new Set(allowed.map((row) => row.id)));
  if (causas.length === 800) {
    result.coverageLimited = true;
    if (result.status === "clear") result.status = "warning";
  }
  return result;
}

export function summarizeConflictStatus(
  conflicts: ConflictHit[]
): "clear" | "warning" | "blocked" {
  if (conflicts.some((c) => c.severity === "blocked")) return "blocked";
  if (conflicts.length) return "warning";
  return "clear";
}
