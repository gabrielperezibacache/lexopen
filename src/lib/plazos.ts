/**
 * Motor de plazos Chile: días hábiles (lun–vie) con feriados judiciales fijos
 * y variables conocidos. No sustituye cómputo oficial del tribunal.
 */

/** Feriados fijos (mes-día). */
const FERIADOS_FIJOS = [
  "01-01", // Año Nuevo
  "05-01", // Trabajo
  "05-21", // Glorias Navales
  "06-20", // Día Nacional de los Pueblos Indígenas (puede variar)
  "06-29", // San Pedro y San Pablo (puede moverse; simplificado)
  "07-16", // Carmen
  "08-15", // Asunción
  "09-18", // Independencia
  "09-19", // Glorias del Ejército
  "09-20", // Fiestas Patrias adicional cuando aplica (simplificado)
  "10-12", // Encuentro de Dos Mundos (puede moverse)
  "10-31", // Iglesias Evangélicas
  "11-01", // Todos los Santos
  "12-08", // Inmaculada
  "12-25", // Navidad
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isFeriado(d: Date) {
  const key = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return FERIADOS_FIJOS.includes(key);
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
