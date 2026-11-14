export const CASE_REFRESH_HOURS = [8, 22];
export const CASE_REFRESH_TIMEZONE = "America/Santiago";
export const CASE_REFRESH_LABEL = "08:00 y 22:00 · hora de Chile";
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: CASE_REFRESH_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
/** @param {Date} date */
function wall(date) { return Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value])); }
/** The hour-long window only lets an already-started batch finish. New batches start in minute zero. @param {Date} [now] */
export function caseRefreshWindow(now = new Date()) {
  const p = wall(now), hour = Number(p.hour);
  return CASE_REFRESH_HOURS.includes(hour) ? { key: `${p.year}-${p.month}-${p.day}T${p.hour}`, canStart: p.minute === "00" } : null;
}
/** Converts the target civil hour independently of UTC offset/DST or the machine timezone. @param {string} day @param {number} hour */
function instant(day, hour) {
  const [y, m, d] = day.split("-").map(Number), target = Date.UTC(y, m - 1, d, hour);
  let value = target;
  for (let i = 0; i < 5; i++) {
    const p = wall(new Date(value));
    const observed = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    if (observed === target) break;
    value += target - observed;
  }
  return new Date(value);
}
/** Strictly after now: a manual refresh never displaces the next automatic appointment. @param {Date} [now] */
export function nextCaseRefreshAt(now = new Date()) {
  const p = wall(now), today = `${p.year}-${p.month}-${p.day}`;
  for (const hour of CASE_REFRESH_HOURS) { const at = instant(today, hour); if (at > now) return at; }
  const next = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1)).toISOString().slice(0, 10);
  return instant(next, CASE_REFRESH_HOURS[0]);
}
