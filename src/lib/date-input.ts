import { isValidYmd } from "./chile-time";

/** Strict date/date-time input; rejects rollover and nonexistent local DST times. */
export function parseDateInput(value: string): Date | null {
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!match || !isValidYmd(match[1])) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  if (match[2] === undefined) return new Date(`${match[1]}T00:00:00.000Z`);
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  if (!match[6] && (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second)) return null;
  return date;
}
