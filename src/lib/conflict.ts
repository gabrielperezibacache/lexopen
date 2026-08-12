import { prisma } from "@/lib/db";
import { normalizarRut } from "@/lib/chile";

export type ConflictHit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
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

/** Busca conflictos de partes/RUT en causas activas. */
export async function checkConflicts(opts: {
  partes: Array<{ nombre: string; rut?: string | null }>;
  excludeCausaId?: string;
}): Promise<ConflictHit[]> {
  const hits: ConflictHit[] = [];
  const activas = await prisma.causa.findMany({
    where: {
      estado: { in: ["activa", "suspensa"] },
      ...(opts.excludeCausaId ? { id: { not: opts.excludeCausaId } } : {}),
    },
    include: { partes: true, cliente: true },
    take: 500,
  });

  for (const parte of opts.partes) {
    const nombre = parte.nombre.trim().toLowerCase();
    const rut = parte.rut ? normalizarRut(parte.rut) : null;
    for (const c of activas) {
      for (const p of c.partes) {
        const sameRut =
          rut && p.rut && normalizarRut(p.rut) === rut;
        const sameName =
          nombre.length >= 4 && p.nombre.toLowerCase().includes(nombre);
        if (sameRut || sameName) {
          hits.push({
            causaId: c.id,
            titulo: c.titulo,
            rit: c.rit,
            match: sameRut
              ? `RUT ${rut} ya figura en ${c.rit || c.titulo}`
              : `Nombre similar «${p.nombre}» en ${c.rit || c.titulo}`,
            severity: sameRut ? "blocked" : "warning",
          });
        }
      }
      if (
        rut &&
        c.cliente?.rut &&
        normalizarRut(c.cliente.rut) === rut
      ) {
        hits.push({
          causaId: c.id,
          titulo: c.titulo,
          rit: c.rit,
          match: `Cliente con RUT ${rut} en causa ${c.rit || c.titulo}`,
          severity: "warning",
        });
      }
    }
  }

  // Deduplicate by causa+match
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.causaId}:${h.match}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
