import { allDayEventDates } from "@/lib/chile-time";

import { prisma } from "@/lib/db";






import { mapGoogleEventToEventoFields, type GoogleCalendarEventRaw } from "@/lib/integrations/google-calendar-pull";

import { GoogleIntegrationError, googleFetch, readGoogleError, softGoogleFailure, requireCalendarSession, type GoogleConfig } from "./google-session";

export async function pushPlazoToGoogleCalendar(plazoId: string) {
  const plazo = await prisma.plazo.findUnique({
    where: { id: plazoId },
    include: { causa: true },
  });
  if (!plazo) throw new Error("Plazo no encontrado");

  let config: GoogleConfig;
  try {
    config = await requireCalendarSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      const soft = softGoogleFailure(e);
      const dates = allDayEventDates(plazo.fechaLimite);
      return {
        ...soft,
        draftEvent: {
          summary: `[LexOpen] ${plazo.titulo}`,
          description: `${plazo.descripcion ?? ""}\nCausa: ${plazo.causa?.titulo ?? "—"} (${plazo.causa?.rit ?? ""})`,
          start: { date: dates.start },
          end: { date: dates.end },
        },
      };
    }
    throw e;
  }

  const dates = allDayEventDates(plazo.fechaLimite);
  const res = await googleFetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `[LexOpen] ${plazo.titulo}`,
        description: `${plazo.descripcion ?? ""}\nCausa: ${plazo.causa?.titulo ?? ""}`,
        start: { date: dates.start },
        end: { date: dates.end },
      }),
    }
  );

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Calendar API failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Calendar API failed: ${detail}`
    );
  }

  const event = await res.json();
  return { status: "created" as const, event };
}

/** Crea o actualiza un evento (Evento LexOpen) en Calendar, o un stub local si no hay token. */
export async function pushEventoToGoogleCalendar(eventoId: string) {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    include: { causa: true },
  });
  if (!evento) throw new Error("Evento no encontrado");

  const summary = `[LexOpen] ${evento.titulo}`;
  const description = [
    evento.notas || "",
    evento.causa ? `Causa: ${evento.causa.titulo} (${evento.causa.rit ?? ""})` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let config: GoogleConfig;
  try {
    config = await requireCalendarSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      const soft = softGoogleFailure(e);
      const draftEvent = evento.todoElDia
        ? {
            summary,
            description,
            ...allDayEventDates(evento.inicio),
          }
        : {
            summary,
            description,
            start: { dateTime: evento.inicio.toISOString() },
            end: { dateTime: (evento.fin || evento.inicio).toISOString() },
          };
      return { ...soft, draftEvent };
    }
    throw e;
  }

  const eventPayload = evento.todoElDia
    ? (() => {
        const dates = allDayEventDates(evento.inicio);
        return {
          summary,
          description,
          location: evento.lugar || undefined,
          start: { date: dates.start },
          end: { date: dates.end },
        };
      })()
    : {
        summary,
        description,
        location: evento.lugar || undefined,
        start: { dateTime: evento.inicio.toISOString() },
        end: { dateTime: (evento.fin || evento.inicio).toISOString() },
      };

  const existingId = evento.googleEventId;
  const url = existingId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}`
    : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

  const res = await googleFetch(url, {
    method: existingId ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventPayload),
  });

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Calendar API failed (evento)", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Calendar API failed: ${detail}`
    );
  }

  const event = (await res.json()) as { id: string };
  await prisma.evento.update({
    where: { id: evento.id },
    data: { googleEventId: event.id },
  });

  return { status: existingId ? ("updated" as const) : ("created" as const), event };
}

/**
 * Pull: lista eventos del calendario primario en un rango y upserta `Evento`
 * por `googleEventId`. Soft-fail con el mismo patrón que push (needs_oauth, etc.).
 */
export async function pullGoogleCalendarEvents(opts: {
  responsableId: string;
  timeMin?: Date;
  timeMax?: Date;
}) {
  let config: GoogleConfig;
  try {
    config = await requireCalendarSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      return softGoogleFailure(e);
    }
    throw e;
  }

  const now = Date.now();
  const timeMin = opts.timeMin || new Date(now - 7 * 86400_000);
  const timeMax = opts.timeMax || new Date(now + 60 * 86400_000);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Calendar list failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Calendar list failed: ${detail}`
    );
  }

  const data = (await res.json()) as { items?: GoogleCalendarEventRaw[] };
  const items = data.items || [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const mapped = mapGoogleEventToEventoFields(item);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    const existing = await prisma.evento.findFirst({
      where: { googleEventId: mapped.googleEventId },
    });
    if (existing) {
      await prisma.evento.update({
        where: { id: existing.id },
        data: {
          titulo: mapped.titulo,
          inicio: mapped.inicio,
          fin: mapped.fin,
          todoElDia: mapped.todoElDia,
          lugar: mapped.lugar,
          notas: mapped.notas,
          estado: mapped.estado,
        },
      });
      updated += 1;
    } else {
      await prisma.evento.create({
        data: {
          titulo: mapped.titulo,
          tipo: mapped.tipo,
          inicio: mapped.inicio,
          fin: mapped.fin,
          todoElDia: mapped.todoElDia,
          lugar: mapped.lugar,
          notas: mapped.notas,
          estado: mapped.estado,
          googleEventId: mapped.googleEventId,
          responsableId: opts.responsableId,
        },
      });
      created += 1;
    }
  }

  return {
    status: "ok" as const,
    created,
    updated,
    skipped,
    fetched: items.length,
  };
}

/** Elimina (best-effort) un evento de Google Calendar. Nunca lanza si no hay sesión. */
export async function deleteGoogleCalendarEvent(googleEventId: string) {
  let config: GoogleConfig;
  try {
    config = await requireCalendarSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      return softGoogleFailure(e);
    }
    throw e;
  }

  const res = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.accessToken}` },
    }
  );

  // 404/410: ya no existe en Google — éxito best-effort para el caller.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const detail = await readGoogleError(res);
    console.error("Google Calendar delete failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Calendar delete failed: ${detail}`
    );
  }

  return { status: "deleted" as const };
}

