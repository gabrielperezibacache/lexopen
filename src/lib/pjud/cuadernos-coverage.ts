import { z } from "zod";
import type { PjudCuadernosCoverage } from "@/lib/pjud/types";
import { PJUD_MAX_CAUSA_MOVIMIENTOS, PJUD_MAX_CUADERNOS } from "./cuadernos-limits";

// OJV option values can be session JWTs. Only our public, stable keys cross
// the browser boundary; opaque option values must never become stored metadata.
const publicKey = /^cuaderno:(?:\d+(?:\.\d+){0,5}|label:[a-f0-9]{16,64})$/;
export const pjudCuadernosCoverageSchema = z.object({
  status: z.enum(["complete", "partial", "unknown"]),
  total: z.number().int().min(0).max(100_000).nullable(),
  read: z.number().int().min(0).max(PJUD_MAX_CUADERNOS),
  items: z.array(z.object({
    key: z.string().regex(publicKey),
    label: z.string().trim().min(1).max(255),
    status: z.enum(["ok", "failed"]),
    count: z.number().int().min(0).max(PJUD_MAX_CAUSA_MOVIMIENTOS),
    note: z.string().max(1000).optional(),
  }).strict()).max(PJUD_MAX_CUADERNOS),
}).strict().superRefine((value, context) => {
  const ok = value.items.filter(item => item.status === "ok").length;
  if (new Set(value.items.map(item => item.key)).size !== value.items.length || value.read !== ok) {
    context.addIssue({ code: "custom", message: "La cobertura debe identificar cuadernos distintos y lecturas confirmadas." });
  }
  if (value.total !== null && value.total < value.items.length) {
    context.addIssue({ code: "custom", message: "La cobertura no puede incluir más cuadernos que el total informado." });
  }
  if (value.status === "complete" && (value.total === null || value.total < 1 || value.read !== value.total || value.items.length !== value.total)) {
    context.addIssue({ code: "custom", message: "Una cobertura completa requiere la lectura de todos los cuadernos identificados." });
  }
  if (value.status === "unknown" && (value.total !== null || value.read !== 0 || value.items.length !== 0)) {
    context.addIssue({ code: "custom", message: "Una cobertura desconocida no puede afirmar lecturas identificadas." });
  }
});

export function unknownCuadernosCoverage(): PjudCuadernosCoverage {
  return { status: "unknown", total: null, read: 0, items: [] };
}

/** Old providers and stored nulls remain explicitly unverified, never complete. */
export function normalizeCuadernosCoverage(value: unknown): PjudCuadernosCoverage {
  const parsed = pjudCuadernosCoverageSchema.safeParse(value);
  return parsed.success ? parsed.data : unknownCuadernosCoverage();
}

export function cuadernosCoverageNote(coverage: PjudCuadernosCoverage): string {
  if (coverage.status === "complete") return `Se leyeron los ${coverage.read} cuadernos disponibles en la consulta OJV.`;
  if (coverage.status === "partial") return `Lectura parcial de cuadernos: ${coverage.read}${coverage.total === null ? "" : ` de ${coverage.total}`} comprobados. Hay cuadernos pendientes o incompletos; vuelva a sincronizar.`;
  return "La consulta no informó una lista verificable de cuadernos; su cobertura no está confirmada.";
}
