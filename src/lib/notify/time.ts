/**
 * Wall-clock helpers for notification scheduling (quiet hours, hitos 09:00,
 * digest 08:00). Uses Intl so Chile DST transitions resolve correctly.
 */

export const DEFAULT_TZ = "America/Santiago";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    formatter(tz);
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type WallParts = {
  ymd: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function wallParts(date: Date, tz = DEFAULT_TZ): WallParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

function offsetMs(date: Date, tz: string) {
  const p = wallParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * UTC instant for a wall-clock time in `tz`. Nonexistent local times (DST gap)
 * resolve forward; ambiguous ones resolve to the first occurrence.
 */
export function zonedTime(ymd: string, hhmm: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = offsetMs(new Date(guess), tz);
  let result = guess - first;
  const second = offsetMs(new Date(result), tz);
  if (second !== first) result = guess - second;
  const check = wallParts(new Date(result), tz);
  const wanted = hh * 60 + mm;
  if (check.ymd < ymd || (check.ymd === ymd && check.hour * 60 + check.minute < wanted)) {
    result += 60 * 60 * 1000;
  }
  return new Date(result);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseHhmm(value: string | null | undefined, fallback: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  const raw = match ? match : /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  const h = Math.min(23, Number(raw[1]));
  const m = Math.min(59, Number(raw[2]));
  return h * 60 + m;
}

export function isValidHhmm(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
}
