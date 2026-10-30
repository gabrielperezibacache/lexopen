/**
 * Mapeo puro Google Calendar → campos Evento LexOpen (sin I/O).
 * Usado por `pullGoogleCalendarEvents` y tests unitarios.
 */

export type GoogleCalendarEventRaw = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export type MappedGoogleEvento = {
  googleEventId: string;
  titulo: string;
  inicio: Date;
  fin: Date | null;
  todoElDia: boolean;
  lugar: string | null;
  notas: string | null;
  /** programado | cancelado */
  estado: "programado" | "cancelado";
  tipo: "reunion" | "recordatorio" | "otro";
};

/** Quita prefijo de push LexOpen para no duplicar al reimportar. */
export function stripLexOpenCalendarPrefix(summary: string): string {
  return summary.replace(/^\[LexOpen\]\s*/i, "").trim() || summary.trim();
}

/**
 * Convierte un ítem de Calendar API a campos Evento.
 * Devuelve null si falta id o fechas usables.
 */
export function mapGoogleEventToEventoFields(
  ev: GoogleCalendarEventRaw
): MappedGoogleEvento | null {
  if (!ev.id) return null;
  const startDate = ev.start?.date;
  const startDt = ev.start?.dateTime;
  const endDate = ev.end?.date;
  const endDt = ev.end?.dateTime;

  let inicio: Date;
  let fin: Date | null;
  let todoElDia: boolean;

  if (startDate) {
    todoElDia = true;
    const [y, m, d] = startDate.split("-").map(Number);
    inicio = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    if (endDate) {
      // Google all-day end is exclusive
      const [ey, em, ed] = endDate.split("-").map(Number);
      const endExclusive = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
      const lastDay = new Date(endExclusive);
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);
      fin = lastDay.getTime() > inicio.getTime() ? lastDay : null;
    } else {
      fin = null;
    }
  } else if (startDt) {
    todoElDia = false;
    inicio = new Date(startDt);
    if (Number.isNaN(inicio.getTime())) return null;
    fin = endDt ? new Date(endDt) : null;
    if (fin && Number.isNaN(fin.getTime())) fin = null;
  } else {
    return null;
  }

  const rawTitle = (ev.summary || "").trim() || "Sin título (Google)";
  const titulo = stripLexOpenCalendarPrefix(rawTitle).slice(0, 200);
  const cancelled = (ev.status || "").toLowerCase() === "cancelled";

  return {
    googleEventId: ev.id,
    titulo,
    inicio,
    fin,
    todoElDia,
    lugar: ev.location?.trim().slice(0, 300) || null,
    notas: ev.description?.trim().slice(0, 5000) || null,
    estado: cancelled ? "cancelado" : "programado",
    tipo: "reunion",
  };
}
