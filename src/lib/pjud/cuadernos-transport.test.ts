import assert from "node:assert/strict";
import { boundPjudLookupTransport } from "./cuadernos-transport";
import { normalizeCuadernosCoverage } from "./cuadernos-coverage";

const rows = [
  { cuaderno: "Principal", detalle: "x".repeat(200) },
  { cuaderno: "2.0 - Incidente", detalle: "y".repeat(4000) },
];
const payload = {
  movimientos: rows,
  cuadernos: { status: "complete", total: 2, read: 2, items: [
    { key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok", count: 1 },
    { key: "cuaderno:2.0", label: "2.0 - Incidente", status: "ok", count: 1 },
  ] },
};
const partial = boundPjudLookupTransport(payload, 3000);
assert.equal(partial.movimientos.length, 1);
assert.equal(partial.cuadernos.status, "partial");
assert.equal(partial.cuadernos.read, 1);
assert.equal(partial.cuadernos.items[1].status, "failed");
assert.ok(Buffer.byteLength(JSON.stringify(partial)) <= 3000);
assert.equal(normalizeCuadernosCoverage(partial.cuadernos).status, "partial");
assert.equal(boundPjudLookupTransport(payload).movimientos.length, 2);
assert.equal(boundPjudLookupTransport(payload).cuadernos.status, "complete");
const countLimited = boundPjudLookupTransport(payload, 20_000, 1);
assert.equal(countLimited.cuadernos.status, "partial");
assert.equal(countLimited.movimientos.length, 1);
console.log("PJUD transport preserves recovered rows and explicit partial coverage at byte/row bounds.");
