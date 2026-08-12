import assert from "node:assert/strict";
import {
  demoSalasTablaHtml,
  formatSalaMatchNote,
  matchMonitoredCausasToSalas,
  normalizeRitKey,
  parseSalasTablaHtml,
} from "@/lib/pjud/salas";

assert.equal(normalizeRitKey(" c-100-2024 "), "C-100-2024");
assert.equal(normalizeRitKey(null), "");

const html = demoSalasTablaHtml({
  rit: "C-100-2024",
  fecha: "12/08/2026",
  sala: "Sala 2",
});
const entries = parseSalasTablaHtml(html);
assert.ok(entries.length >= 1);
assert.equal(entries[0].rit, "C-100-2024");
assert.equal(entries[0].fecha, "2026-08-12");

const matches = matchMonitoredCausasToSalas(
  [
    {
      id: "c1",
      rit: "C-100-2024",
      tribunal: "Corte de Apelaciones de Santiago",
    },
    { id: "c2", rit: "C-200-2024", tribunal: "Civil" },
  ],
  entries
);
assert.equal(matches.length, 1);
assert.equal(matches[0].causaId, "c1");
assert.match(formatSalaMatchNote(matches[0]), /Sala 2/);

assert.equal(
  matchMonitoredCausasToSalas(
    [{ id: "x", rit: null, tribunal: "Civil" }],
    entries
  ).length,
  0
);

console.log("pjud/salas.test.ts OK");
