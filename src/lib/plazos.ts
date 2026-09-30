/**
 * Motor de plazos Chile: días hábiles (lun–vie) y corridos, con feriados
 * nacionales vigentes. No sustituye el cómputo oficial del tribunal ni
 * descuenta la feria judicial de febrero ni feriados regionales.
 *
 * Hábiles: lunes a viernes, sin feriados (el sábado no se cuenta: útil para
 * plazos administrativos e internos). Corridos: cada día calendario; si el
 * último cae en sábado, domingo o feriado, se corre al día hábil siguiente.
 */

import {
  addCivilDays,
  civilDateKey,
  diffCivilDays,
  isValidYmd,
  santiagoDateKey,
  ymdToLocalNoon,
} from "@/lib/chile-time";

/** Feriados fijos (mes-día) del calendario nacional vigente. */
const FERIADOS_FIJOS = [
  "01-01", // Año Nuevo
  "05-01", // Trabajo
  "05-21", // Glorias Navales
  "07-16", // Virgen del Carmen (Ley 20.148)
  "08-15", // Asunción
  "09-18", // Independencia
  "09-19", // Glorias del Ejército
  "10-31", // Iglesias evangélicas (Ley 20.299)
  "11-01", // Todos los Santos
  "12-08", // Inmaculada
  "12-25", // Navidad
];

export type TipoComputo = "habiles" | "corridos";
export type UrgenciaPlazo = "vencido" | "critico" | "proximo" | "ok";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function weekdayOfYmd(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Computus (Meeus/Jones/Butcher) → domingo de Pascua, mediodía local. */
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

function easterYmd(year: number) {
  const easter = easterSunday(year);
  return ymdFromParts(easter.getFullYear(), easter.getMonth(), easter.getDate());
}

/**
 * Ley 19.668: 29 de junio y 12 de octubre pasan al lunes de esa semana
 * si caen martes, miércoles o jueves, o al lunes siguiente si caen viernes.
 * Sábado, domingo y lunes se mantienen.
 */
export function trasladarLunesLey19668(ymd: string): string {
  const dow = weekdayOfYmd(ymd);
  if (dow >= 2 && dow <= 4) return addCivilDays(ymd, 1 - dow);
  if (dow === 5) return addCivilDays(ymd, 3);
  return ymd;
}

/** Solsticio de junio (Meeus) como instante UTC. En junio Chile está en UTC−4. */
function juneSolsticeUtc(year: number): Date {
  const years = (year - 2000) / 1000;
  const jde =
    2451716.56767 +
    365241.62603 * years +
    0.00325 * years * years +
    0.00888 * years * years * years -
    0.0003 * years * years * years * years;
  const z = Math.floor(jde + 0.5);
  const f = jde + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayFloat = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const y = month > 2 ? c - 4716 : c - 4715;
  const day = Math.floor(dayFloat);
  const hours = (dayFloat - day) * 24;
  return new Date(Date.UTC(y, month - 1, day) + hours * 3_600_000);
}

/** Día Nacional de los Pueblos Indígenas (Ley 21.357): solsticio en Chile, desde 2021. */
export function pueblosIndigenasYmd(year: number): string | null {
  if (year < 2021) return null;
  return santiagoDateKey(juneSolsticeUtc(year));
}

const movableCache = new Map<number, Set<string>>();

export function feriadosMoviles(year: number): Set<string> {
  const cached = movableCache.get(year);
  if (cached) return cached;
  const easter = easterYmd(year);
  const pueblos = pueblosIndigenasYmd(year);
  const set = new Set<string>([
    addCivilDays(easter, -2), // Viernes Santo
    addCivilDays(easter, -1), // Sábado Santo
    trasladarLunesLey19668(`${year}-06-29`),
    trasladarLunesLey19668(`${year}-10-12`),
  ]);
  if (pueblos) set.add(pueblos);
  movableCache.set(year, set);
  return set;
}

export function ymdDe(date: Date) {
  return civilDateKey(date);
}

export function isWeekendYmd(ymd: string) {
  const day = weekdayOfYmd(ymd);
  return day === 0 || day === 6;
}

export function isFeriadoYmd(ymd: string) {
  if (!isValidYmd(ymd)) return false;
  const key = ymd.slice(5);
  if (FERIADOS_FIJOS.includes(key)) return true;
  return feriadosMoviles(Number(ymd.slice(0, 4))).has(ymd);
}

export function isDiaHabilYmd(ymd: string) {
  return isValidYmd(ymd) && !isWeekendYmd(ymd) && !isFeriadoYmd(ymd);
}

export function isWeekend(d: Date) {
  return isWeekendYmd(civilDateKey(d));
}

export function isFeriado(d: Date) {
  return isFeriadoYmd(civilDateKey(d));
}

export function isDiaHabil(d: Date) {
  return isDiaHabilYmd(civilDateKey(d));
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/** Siguiente día hábil (lun–vie, sin feriado), o la misma fecha si ya lo es. */
export function proximoDiaHabilYmd(ymd: string): string {
  let cursor = ymd;
  while (!isDiaHabilYmd(cursor)) cursor = addCivilDays(cursor, 1);
  return cursor;
}

/**
 * Suma días corridos o hábiles desde la fecha de notificación.
 * El día de la notificación no se cuenta. Devuelve `YYYY-MM-DD`.
 */
export function calcularVencimientoYmd(opts: {
  desde: string;
  dias: number;
  tipoComputo?: TipoComputo;
}): string {
  if (!isValidYmd(opts.desde)) throw new Error("Fecha inválida");
  const tipo = opts.tipoComputo || "habiles";
  let remaining = Math.max(0, opts.dias);
  if (remaining === 0) return opts.desde;

  let cursor = addCivilDays(opts.desde, 1);
  while (remaining > 0) {
    if (tipo === "corridos" || isDiaHabilYmd(cursor)) {
      remaining -= 1;
      if (remaining === 0) break;
    }
    cursor = addCivilDays(cursor, 1);
  }
  if (tipo === "corridos") cursor = proximoDiaHabilYmd(cursor);
  return cursor;
}

/** Suma días corridos o hábiles desde una fecha de notificación. */
export function calcularVencimiento(opts: {
  desde: Date;
  dias: number;
  tipoComputo?: TipoComputo;
}): Date {
  return ymdToLocalNoon(
    calcularVencimientoYmd({
      desde: civilDateKey(opts.desde),
      dias: opts.dias,
      tipoComputo: opts.tipoComputo,
    })
  );
}

export function diasRestantes(fechaLimite: Date, hoy = new Date()) {
  return diffCivilDays(civilDateKey(hoy), civilDateKey(fechaLimite));
}

export function clasificarUrgencia(fechaLimite: Date, hoy = new Date()): UrgenciaPlazo {
  const dias = diasRestantes(fechaLimite, hoy);
  if (dias < 0) return "vencido";
  if (dias <= 2) return "critico";
  if (dias <= 7) return "proximo";
  return "ok";
}

export function labelUrgencia(code: string, dias?: number) {
  if (code === "vencido") return "Vencido";
  if (code === "critico" && dias === 0) return "Vence hoy";
  if (code === "critico") return "Urgente";
  if (code === "proximo") return "Próximo";
  if (code === "ok") return "En plazo";
  return code;
}

export function urgenciaBadgeClass(code: string) {
  if (code === "vencido" || code === "critico") return "badge-vencido";
  if (code === "proximo") return "badge-pendiente";
  return "badge-activa";
}

export function labelDiasRestantes(dias: number) {
  if (dias < 0) {
    const n = Math.abs(dias);
    return n === 1 ? "venció ayer" : `venció hace ${n} días`;
  }
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

export function labelTipoComputo(tipo: string) {
  if (tipo === "corridos") return "Corridos";
  if (tipo === "habiles") return "Hábiles";
  return tipo;
}
