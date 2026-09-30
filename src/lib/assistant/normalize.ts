/**
 * Normalización de texto es-CL del asistente: fechas relativas (Santiago),
 * RIT/ROL y RUC. Reutiliza `lib/chile-time` (America/Santiago), `lib/plazos`
 * (días hábiles) y `lib/chile` (validadores) — no reimplementa cómputo.
 */

import { addCivilDays, santiagoDateKey } from "@/lib/chile-time";
import { calcularVencimientoYmd } from "@/lib/plazos";
import { validarRit, validarRuc } from "@/lib/chile";
import { normalizeSearch } from "@/lib/search";

export type NormalizedAssistantInput = {
  /** Texto original (trim), tal como lo escribió el usuario. */
  text: string;
  /** Fechas civiles `YYYY-MM-DD` detectadas, en orden de aparición de regla. */
  dates: string[];
  /** Hora `HH:mm` si el texto dice «a las N» / «a las N:MM». */
  time?: string;
  rit?: string;
  ruc?: string;
  /** Menciones `@algo` (p. ej. `@causa`, `@cliente`) sin el prefijo. */
  mentions: string[];
};

const DIA_SEMANA: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

/** Próxima fecha (a partir de mañana) cuyo día de semana coincide con `target`. */
function proximoDiaSemana(desdeYmd: string, target: number): string {
  let cursor = addCivilDays(desdeYmd, 1);
  for (let i = 0; i < 8; i += 1) {
    const [y, m, d] = cursor.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === target) return cursor;
    cursor = addCivilDays(cursor, 1);
  }
  return cursor;
}

/** Extrae la primera coincidencia de RIT/ROL válida (`validarRit`) del texto crudo. */
function extractRit(raw: string): string | undefined {
  const candidates = raw.match(/\b[A-Za-z]{0,3}-?\d{1,6}-\d{4}\b/g) || [];
  for (const candidate of candidates) {
    if (validarRit(candidate)) return candidate.toUpperCase();
  }
  return undefined;
}

/** Extrae la primera coincidencia de RUC judicial válida (`validarRuc`) del texto crudo. */
function extractRuc(raw: string): string | undefined {
  const candidates = raw.match(/\b\d{10,12}-?[\dkK]\b/g) || [];
  for (const candidate of candidates) {
    if (validarRuc(candidate)) return candidate.toUpperCase();
  }
  return undefined;
}

function extractMentions(raw: string): string[] {
  const matches = raw.match(/@[\p{L}\d._-]+/gu) || [];
  return matches.map((m) => m.slice(1));
}

/**
 * Normaliza el texto del asistente: detecta fechas relativas es-CL
 * (hoy/mañana/pasado mañana/el <día>/en N días[ hábiles]) anclado a
 * America/Santiago, y extrae RIT/RUC/menciones. Función pura y testeable.
 */
export function normalizeAssistantInput(
  text: string,
  now: Date = new Date()
): NormalizedAssistantInput {
  const raw = text.trim();
  const flat = normalizeSearch(raw);
  const todayYmd = santiagoDateKey(now);
  const dates: string[] = [];

  if (/\bpasado\s+manana\b/.test(flat)) {
    dates.push(addCivilDays(todayYmd, 2));
  } else if (/\bmanana\b/.test(flat)) {
    dates.push(addCivilDays(todayYmd, 1));
  }
  if (/\bhoy\b/.test(flat)) {
    dates.push(todayYmd);
  }

  for (const [name, dow] of Object.entries(DIA_SEMANA)) {
    if (new RegExp(`\\bel\\s+${name}\\b`).test(flat)) {
      dates.push(proximoDiaSemana(todayYmd, dow));
    }
  }

  const enDiasHabilesMatch = flat.match(/\ben\s+(\d{1,4})\s+dias\s+habiles\b/);
  if (enDiasHabilesMatch) {
    dates.push(
      calcularVencimientoYmd({
        desde: todayYmd,
        dias: Number(enDiasHabilesMatch[1]),
        tipoComputo: "habiles",
      })
    );
  } else {
    const enDiasMatch = flat.match(/\ben\s+(\d{1,4})\s+dias\b/);
    if (enDiasMatch) {
      dates.push(addCivilDays(todayYmd, Number(enDiasMatch[1])));
    }
  }

  let time: string | undefined;
  const timeMatch = flat.match(/\ba\s+las\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (timeMatch) {
    const hh = String(Math.min(23, Number(timeMatch[1]))).padStart(2, "0");
    const mm = String(Math.min(59, Number(timeMatch[2] || "0"))).padStart(2, "0");
    time = `${hh}:${mm}`;
  }

  return {
    text: raw,
    dates: Array.from(new Set(dates)),
    time,
    rit: extractRit(raw),
    ruc: extractRuc(raw),
    mentions: extractMentions(raw),
  };
}
