import assert from "node:assert/strict";
import {
  classifyMailSubject,
  flattenMimeText,
  normalizeRit,
  parseExactMailMatter,
  parseMailContent,
} from "@/lib/mail/parse";

assert.equal(normalizeRit("C 1234 2024"), "C-1234-2024");
assert.equal(normalizeRit("1234-2024"), "1234-2024");

assert.equal(
  flattenMimeText([" line one ", "", "line two"]),
  "line one\n\nline two"
);

const res = parseMailContent(
  "Notificación resolución C-1234-2024",
  "Tribunal: 1° Juzgado Civil de Santiago\nResolución: Se tiene por evacuado trámite."
);
assert.equal(res.kind, "resolucion");
assert.equal(res.rit, "C-1234-2024");
assert.ok(res.resolucion?.includes("evacuado"));
assert.deepEqual(parseExactMailMatter("Sentencia C-1234-2024", "Tribunal: 1° Juzgado Civil de Santiago\nC-1234-2024"), { rit: "C-1234-2024", courtKey: "1 juzgado civil de santiago" });
assert.deepEqual(parseExactMailMatter("Audiencia · ROL 1234-2024", "Tribunal: Corte de Apelaciones de Santiago"), { rit: "1234-2024", courtKey: "corte de apelaciones de santiago" });
assert.equal(parseExactMailMatter("C-1234-2024", "Sin tribunal indicado"), null);
assert.equal(parseExactMailMatter("C-1234-2024", "Tribunal: 1° Juzgado Civil de Santiago\nC-1235-2024"), null);
assert.equal(parseExactMailMatter("C-1234-2024", "Tribunal: 1° Juzgado Civil de Santiago\nTribunal: 2° Juzgado Civil de Santiago"), null);
assert.equal(parseExactMailMatter("Fecha 10-2024", "Tribunal: 1° Juzgado Civil de Santiago"), null);
assert.equal(classifyMailSubject("Audiencia C-1234-2024", "Citados a comparecer"), "tablas");
assert.equal(classifyMailSubject("Sentencia C-1234-2024", "Texto"), "resolucion");

const tablas = parseMailContent(
  "Horario de tablas CA",
  "Causa C-99-2023 comparendo el 20/08/2026 sala 3"
);
assert.equal(tablas.kind, "tablas");
assert.equal(tablas.rit, "C-99-2023");
assert.ok(tablas.tablaFecha);

assert.equal(classifyMailSubject("Hola", "texto genérico"), "otro");

console.log("mail/parse.test.ts OK");
