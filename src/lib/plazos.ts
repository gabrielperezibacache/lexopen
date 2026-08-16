/**
 * Motor de plazos Chile: días hábiles (lun–vie) con feriados fijos y móviles.
 * No sustituye cómputo oficial del tribunal.
 */

/** Feriados fijos (mes-día) que no se mueven. */
const FERIADOS_FIJOS = [
  "01-01", // Año Nuevo
  "05-01", // Trabajo
  "05-21", // Glorias Navales
  "07-16", // Carmen
  "08-15", // Asunción
  "09-18", // Independencia
  "09-19", // Glorias del Ejército
  "10-31", // Iglesias Evangélicas
  "11-01", // Todos los Santos
  "12-08", // Inmaculada
  "12-25", // Navidad
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Computus (Meeus/Jones/Butcher) → domingo de Pascua local noon. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/** Next Monday on/after date (for movable civil holidays). */
function nextMondayOnOrAfter(d: Date) {
  const day = d.getDay();
  const delta = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  return addDays(d, delta);
}

/** Día de los Pueblos Indígenas: solsticio de invierno austral (~21 jun) → lunes. */
function pueblosIndigenas(year: number) {
  return nextMondayOnOrAfter(new Date(year, 5, 20, 12));
}

/** San Pedro y San Pablo (29 jun) → lunes más cercano / siguiente según ley. */
function sanPedroPablo(year: number) {
  return nextMondayOnOrAfter(new Date(year, 5, 29, 12));
}

/** Encuentro de Dos Mundos (12 oct) → lunes. */
function encuentroDosMundos(year: number) {
  return nextMondayOnOrAfter(new Date(year, 9, 12, 12));
}

/**
 * Extra Fiestas Patrias day: when 18 or 19 fall mid-week, Chile often adds
 * a bridge day. Approximation: if 18 is Tue–Thu, also mark the adjacent
 * Monday/Friday that completes the long weekend — keep 18+19 always, and
 * if 18 is Wednesday add 17; if Friday add 20 (simplified operational set).
 */
function fiestasPatriasExtras(year: number): Date[] {
  const d18 = new Date(year, 8, 18, 12);
  const dow = d18.getDay();
  const extras: Date[] = [];
  if (dow === 3) extras.push(new Date(year, 8, 17, 12)); // mié → mar puente
  if (dow === 5) extras.push(new Date(year, 8, 20, 12)); // vie → sáb no; lun puente vía 20
  if (dow === 2) extras.push(new Date(year, 8, 20, 12)); // mar → vie 20
  return extras;
}

const movableCache = new Map<number, Set<string>>();

export function feriadosMoviles(year: number): Set<string> {
  const cached = movableCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const set = new Set<string>([
    ymd(addDays(easter, -2)), // Viernes Santo
    ymd(pueblosIndigenas(year)),
    ymd(sanPedroPablo(year)),
    ymd(encuentroDosMundos(year)),
    ...fiestasPatriasExtras(year).map(ymd),
  ]);
  movableCache.set(year, set);
  return set;
}

export function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isFeriado(d: Date) {
  const key = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (FERIADOS_FIJOS.includes(key)) return true;
  return feriadosMoviles(d.getFullYear()).has(ymd(d));
}

export function isDiaHabil(d: Date) {
  return !isWeekend(d) && !isFeriado(d);
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/** Suma días corridos o hábiles desde una fecha de notificación. */
export function calcularVencimiento(opts: {
  desde: Date;
  dias: number;
  tipoComputo?: "habiles" | "corridos";
}): Date {
  const tipo = opts.tipoComputo || "habiles";
  let remaining = Math.max(0, opts.dias);
  let cursor = startOfDay(opts.desde);

  if (remaining === 0) return cursor;

  // El cómputo de plazos procesales suele partir del día siguiente
  cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);

  while (remaining > 0) {
    if (tipo === "corridos" || isDiaHabil(cursor)) {
      remaining -= 1;
      if (remaining === 0) break;
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return startOfDay(cursor);
}

export function diasRestantes(fechaLimite: Date, hoy = new Date()) {
  const a = startOfDay(hoy).getTime();
  const b = startOfDay(fechaLimite).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function clasificarUrgencia(fechaLimite: Date) {
  const d = diasRestantes(fechaLimite);
  if (d < 0) return "vencido";
  if (d <= 2) return "critico";
  if (d <= 7) return "proximo";
  return "ok";
}
