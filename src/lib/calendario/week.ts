/**
 * Utilidades de semana civil (lunes–domingo) ancladas a YYYY-MM-DD UTC noon,
 * coherentes con `monthMatrix` del calendario.
 */

export function mondayOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0=dom
  const delta = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekDays(mondayYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(mondayYmd, i));
}

export function shiftWeek(mondayYmd: string, deltaWeeks: number): string {
  return addDaysYmd(mondayYmd, deltaWeeks * 7);
}

/** Rango query inclusivo para la semana (UTC medianoche → fin del domingo). */
export function weekQueryRange(mondayYmd: string): { start: Date; end: Date } {
  const [y, m, d] = mondayYmd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 6, 23, 59, 59, 999));
  return { start, end };
}
