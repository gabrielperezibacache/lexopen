import { addCivilDays, isValidYmd } from "@/lib/chile-time";
import { parseDateInput } from "@/lib/date-input";

export function toDatetimeLocal(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function eventFormDates(start: string, end: string, allDay: boolean) {
  if (allDay) {
    if (!isValidYmd(start) || end && (!isValidYmd(end) || end < start)) throw new Error("Revise el inicio y el último día del evento");
    return { inicio: `${start}T00:00:00.000Z`, fin: `${addCivilDays(end || start, 1)}T00:00:00.000Z` };
  }
  const inicio = parseDateInput(start), fin = end ? parseDateInput(end) : null;
  if (!inicio || end && !fin) throw new Error("Indique una fecha y hora válidas");
  if (fin && fin <= inicio) throw new Error("El fin debe ser posterior al inicio");
  return { inicio: inicio.toISOString(), fin: fin?.toISOString() || null };
}
export function moveEventToDay(iso: string, day: string, allDay = false): string | null {
  if (!isValidYmd(day)) return null;
  if (allDay) return `${day}T00:00:00.000Z`;
  const local = toDatetimeLocal(iso);
  if (!local) return null;
  return parseDateInput(`${day}${local.slice(10)}`)?.toISOString() || null;
}
