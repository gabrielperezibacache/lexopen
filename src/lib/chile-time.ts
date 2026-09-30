/**
 * Fechas civiles de plazos y agenda en America/Santiago.
 *
 * Un `YYYY-MM-DD` guardado como medianoche UTC (`new Date("2026-09-01")`)
 * es la fecha que eligió el usuario, no la noche anterior en Chile.
 * Cualquier otro instante se muestra en el día calendario de Santiago,
 * para que un vencimiento a las 22:00 no salte al día siguiente UTC.
 */

export const SANTIAGO_TZ = "America/Santiago";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(value: string): boolean {
  const match = YMD.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function santiagoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Fecha inválida");
  return `${year}-${month}-${day}`;
}

function isUtcMidnight(date: Date) {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/** Día civil del plazo: fecha-solo UTC, o día en Santiago si trae hora. */
export function civilDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida");
  if (isUtcMidnight(date)) return date.toISOString().slice(0, 10);
  return santiagoDateKey(date);
}

export function addCivilDays(ymd: string, days: number): string {
  if (!isValidYmd(ymd) || !Number.isInteger(days)) {
    throw new Error("Fecha inválida");
  }
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function diffCivilDays(fromYmd: string, toYmd: string): number {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) {
    throw new Error("Fecha inválida");
  }
  const [y1, m1, d1] = fromYmd.split("-").map(Number);
  const [y2, m2, d2] = toYmd.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
}

export function ymdToLocalNoon(ymd: string): Date {
  if (!isValidYmd(ymd)) throw new Error("Fecha inválida");
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function santiagoWallClock(instant: Date): WallClock {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: SANTIAGO_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour) % 24,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Medianoche de Santiago de un día civil, como instante UTC. */
export function santiagoMidnight(ymd: string): Date {
  if (!isValidYmd(ymd)) throw new Error("Fecha inválida");
  const [year, month, day] = ymd.split("-").map(Number);
  let utc = Date.UTC(year, month - 1, day, 4, 0, 0);
  for (let i = 0; i < 4; i++) {
    const wall = santiagoWallClock(new Date(utc));
    const observed = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second
    );
    const target = Date.UTC(year, month - 1, day, 0, 0, 0);
    const delta = observed - target;
    if (delta === 0) break;
    utc -= delta;
  }
  return new Date(utc);
}

/**
 * Rango que incluye la fecha-solo UTC y toda la jornada en Santiago,
 * desde `fromYmd` hasta `toYmd` inclusive.
 */
export function civilSpanQueryRange(fromYmd: string, toYmd: string): {
  start: Date;
  end: Date;
} {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd) || fromYmd > toYmd) {
    throw new Error("Rango de fechas inválido");
  }
  const [year, month, day] = fromYmd.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const santiagoStart = santiagoMidnight(fromYmd);
  const start = utcMidnight < santiagoStart ? utcMidnight : santiagoStart;
  const end = new Date(santiagoMidnight(addCivilDays(toYmd, 1)).getTime() - 1);
  return { start, end };
}

export function civilDayQueryRange(ymd: string) {
  return civilSpanQueryRange(ymd, ymd);
}

/** `monthIndex` es 0–11. */
export function civilMonthQueryRange(year: number, monthIndex: number): {
  start: Date;
  end: Date;
} {
  const month = String(monthIndex + 1).padStart(2, "0");
  const first = `${year}-${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const last = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return civilSpanQueryRange(first, last);
}

export function formatCivilDate(value: Date | string): string {
  const key =
    typeof value === "string"
      ? isValidYmd(value)
        ? value
        : civilDateKey(new Date(value))
      : civilDateKey(value);
  if (!isValidYmd(key)) return "—";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 15)));
}

/** Evento de día completo (Google Calendar usa fin exclusivo). */
export function allDayEventDates(date: Date): { start: string; end: string } {
  const start = civilDateKey(date);
  return { start, end: addCivilDays(start, 1) };
}
