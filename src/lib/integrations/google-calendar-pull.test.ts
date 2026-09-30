import assert from "node:assert/strict";
import {
  mapGoogleEventToEventoFields,
  stripLexOpenCalendarPrefix,
} from "./google-calendar-pull";

assert.equal(stripLexOpenCalendarPrefix("[LexOpen] Audiencia"), "Audiencia");
assert.equal(stripLexOpenCalendarPrefix("[lexopen]  X"), "X");
assert.equal(stripLexOpenCalendarPrefix("Reunión"), "Reunión");

assert.equal(mapGoogleEventToEventoFields({}), null);
assert.equal(mapGoogleEventToEventoFields({ id: "e1" }), null);

const timed = mapGoogleEventToEventoFields({
  id: "g-1",
  summary: "[LexOpen] Junta",
  description: "Notas",
  location: "Santiago",
  start: { dateTime: "2026-09-30T15:00:00.000Z" },
  end: { dateTime: "2026-09-30T16:00:00.000Z" },
});
assert.ok(timed);
assert.equal(timed.titulo, "Junta");
assert.equal(timed.todoElDia, false);
assert.equal(timed.inicio.toISOString(), "2026-09-30T15:00:00.000Z");
assert.equal(timed.fin?.toISOString(), "2026-09-30T16:00:00.000Z");
assert.equal(timed.lugar, "Santiago");
assert.equal(timed.estado, "programado");

const allDay = mapGoogleEventToEventoFields({
  id: "g-2",
  summary: "Plazo",
  start: { date: "2026-10-01" },
  end: { date: "2026-10-02" },
});
assert.ok(allDay);
assert.equal(allDay.todoElDia, true);
assert.equal(allDay.inicio.toISOString().slice(0, 10), "2026-10-01");
assert.equal(allDay.fin, null); // un solo día tras fin exclusivo

const cancelled = mapGoogleEventToEventoFields({
  id: "g-3",
  summary: "Cancelado",
  status: "cancelled",
  start: { dateTime: "2026-09-30T12:00:00.000Z" },
});
assert.ok(cancelled);
assert.equal(cancelled.estado, "cancelado");

console.log("google-calendar-pull.test.ts OK");
