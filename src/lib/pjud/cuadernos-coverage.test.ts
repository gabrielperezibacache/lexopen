import assert from "node:assert/strict";
import { cuadernosCoverageNote, normalizeCuadernosCoverage, unknownCuadernosCoverage } from "./cuadernos-coverage";

const first = { key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok" as const, count: 3 };
const second = { key: "cuaderno:2.0", label: "2.0 - Incidente", status: "failed" as const, count: 0, note: "La respuesta no terminó de cargar." };
const complete = { status: "complete" as const, total: 1, read: 1, items: [first] };
assert.deepEqual(normalizeCuadernosCoverage(complete), complete);
assert.equal(normalizeCuadernosCoverage({ ...complete, items: [{ ...first, count: 0 }] }).status, "complete",
  "a recognized empty history can still cover every available cuaderno");
const partial = { status: "partial" as const, total: 2, read: 1, items: [first, second] };
assert.deepEqual(normalizeCuadernosCoverage(partial), partial);
assert.match(cuadernosCoverageNote(partial), /parcial.*1 de 2/);
for (const unsafe of [
  null, undefined, {},
  { ...complete, total: 2 },
  { ...complete, read: 2 },
  { ...complete, items: [first, first], total: 2, read: 2 },
  { ...complete, items: [{ ...first, key: "eyJhbGciOiJIUzI1NiJ9.PRIVATE_SESSION.JWT" }] },
  { ...complete, token: "PRIVATE_SESSION" },
  { status: "unknown", total: 1, read: 1, items: [first] },
]) assert.deepEqual(normalizeCuadernosCoverage(unsafe), unknownCuadernosCoverage());
assert.match(cuadernosCoverageNote(unknownCuadernosCoverage()), /no está confirmada/);
console.log("Cuaderno coverage: bounded public metadata, complete/partial consistency and legacy unknown passed.");
