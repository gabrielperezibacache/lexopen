import assert from "node:assert/strict";
import { parseMailContent } from "@/lib/mail/parse";

const tablas = parseMailContent(
  "Tabla CA",
  "Causa C-10-2025 comparendo el 15/09/2026 sala 1"
);
assert.equal(tablas.kind, "tablas");
assert.equal(tablas.rit, "C-10-2025");

const res = parseMailContent(
  "Resolución",
  "C-10-2025 Resolución: Se cita a audiencia preparatoria"
);
assert.equal(res.kind, "resolucion");
assert.ok(res.resolucion);

console.log("mail/apply.test.ts OK");
