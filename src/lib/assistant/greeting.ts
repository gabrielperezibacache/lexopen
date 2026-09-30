/** Saludo Chile-time para `/inicio`. Reutiliza `SANTIAGO_TZ` (America/Santiago). */

import { SANTIAGO_TZ } from "@/lib/chile-time";

function santiagoHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SANTIAGO_TZ,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return hour ? Number(hour) : now.getHours();
}

/** "Buenos días/tardes/noches, {name}" según la hora en Santiago. */
export function chileGreeting(name: string, now: Date = new Date()): string {
  const hour = santiagoHour(now);
  const bloque = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  return `${bloque}, ${firstName || name}`;
}
