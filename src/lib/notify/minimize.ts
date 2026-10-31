/**
 * Minimiza variables de plantilla según nivel de detalle (§6.5.1 / D5).
 * El outbox nunca guarda más de lo que se enviará.
 */

import type { NivelDetalle } from "@/lib/notify/catalog";

export type NotifyVars = {
  title: string;
  body: string;
  href?: string | null;
  rit?: string | null;
  tribunal?: string | null;
  plazoTitulo?: string | null;
  fechaLimite?: string | null;
  caratula?: string | null;
  descripcion?: string | null;
  causaId?: string | null;
  hito?: string | null;
  count?: number;
  /** Campos libres ya sanitizados (solo estandar/detallado). */
  extra?: Record<string, string | number | boolean | null | undefined>;
};

const MINIMO_KEYS = new Set([
  "title",
  "body",
  "href",
  "fechaLimite",
  "hito",
  "count",
  "causaId",
]);

const ESTANDAR_KEYS = new Set([
  ...MINIMO_KEYS,
  "rit",
  "tribunal",
  "plazoTitulo",
]);

export function minimizeVars(vars: NotifyVars, nivel: NivelDetalle): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allow =
    nivel === "detallado" ? null : nivel === "estandar" ? ESTANDAR_KEYS : MINIMO_KEYS;

  for (const [key, value] of Object.entries(vars)) {
    if (key === "extra") continue;
    if (value === undefined || value === null || value === "") continue;
    if (allow && !allow.has(key)) continue;
    out[key] = value;
  }

  if (nivel === "detallado" && vars.extra) {
    for (const [k, v] of Object.entries(vars.extra)) {
      if (v === undefined || v === null || v === "") continue;
      out[k] = v;
    }
  }

  if (nivel === "minimo") {
    // Sin RIT/carátula/materia: mensaje genérico.
    if (!out.body && out.title) {
      out.body = String(out.title);
    }
    delete out.rit;
    delete out.tribunal;
    delete out.plazoTitulo;
    delete out.caratula;
    delete out.descripcion;
  }

  return out;
}

/** Texto corto para Telegram/push en nivel mínimo. */
export function minimoCopy(vars: NotifyVars, tipo: string): { title: string; body: string } {
  if (tipo === "plazo.fatal" || tipo === "plazo.fatal.escalamiento") {
    const when = vars.fechaLimite ? ` (${vars.fechaLimite})` : "";
    return {
      title: "Plazo fatal",
      body: `Tienes 1 plazo fatal${when}. Abre LexOpen.`,
    };
  }
  if (tipo.startsWith("plazo.")) {
    return { title: "Plazo", body: "Tienes un plazo próximo. Abre LexOpen." };
  }
  return {
    title: vars.title || "LexOpen",
    body: "Tienes una novedad. Abre LexOpen.",
  };
}
