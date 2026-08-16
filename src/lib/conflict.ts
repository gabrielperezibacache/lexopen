import { prisma } from "@/lib/db";
import { normalizarRut } from "@/lib/chile";

export type ConflictHit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
  /** active = causa abierta; recent_closed = cerrada en ventana reciente */
  source?: "active" | "recent_closed" | "cliente";
};

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

const RECENT_CLOSED_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

/** Busca conflictos de partes/RUT en causas activas y cerradas recientes. */
export async function checkConflicts(opts: {
  partes: Array<{ nombre: string; rut?: string | null }>;
  excludeCausaId?: string;
}): Promise<ConflictHit[]> {
  const hits: ConflictHit[] = [];
  const closedAfter = new Date(Date.now() - RECENT_CLOSED_MS);

  const causas = await prisma.causa.findMany({
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
    const rut = parte.rut ? normalizarRut(parte.rut) : null;
    for (const c of causas) {
      const isActive = c.estado === "activa" || c.estado === "suspensa";
      const source: ConflictHit["source"] = isActive
        ? "active"
        : "recent_closed";

      for (const p of c.partes) {
        const sameRut = Boolean(rut && p.rut && normalizarRut(p.rut) === rut);
        const sameName = namesLikelyMatch(nombre, p.nombre);
        if (sameRut || sameName) {
          const severity: ConflictHit["severity"] =
            sameRut && isActive ? "blocked" : "warning";
          hits.push({
            causaId: c.id,
            titulo: c.titulo,
            rit: c.rit,
            match: sameRut
              ? `RUT ${rut} ya figura en ${c.rit || c.titulo}${
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

      if (rut && c.cliente?.rut && normalizarRut(c.cliente.rut) === rut) {
        hits.push({
          causaId: c.id,
          titulo: c.titulo,
          rit: c.rit,
          match: `Cliente con RUT ${rut} en causa ${c.rit || c.titulo}`,
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
  return hits.filter((h) => {
    const k = `${h.causaId}:${h.match}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function summarizeConflictStatus(
  conflicts: ConflictHit[]
): "clear" | "warning" | "blocked" {
  if (conflicts.some((c) => c.severity === "blocked")) return "blocked";
  if (conflicts.length) return "warning";
  return "clear";
}
