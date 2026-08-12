/**
 * Contratos ligeros de schemas/helpers de trámites y documentos (sin HTTP).
 */
import assert from "node:assert/strict";
import {
  documentoUpdateSchema,
  tramiteCreateSchema,
  tramiteUpdateSchema,
} from "./schemas";
import { isTramiteVencido, labelTramiteEstado } from "./tramites";
import {
  labelConflictSeverity,
  labelConflictStatus,
} from "./conflict";

const created = tramiteCreateSchema.parse({
  titulo: "Presentar demanda",
  detalle: null,
  fechaLimite: "2026-09-01",
  responsableId: "user-1",
  estado: "pendiente",
});
assert.equal(created.titulo, "Presentar demanda");
assert.equal(created.responsableId, "user-1");

assert.throws(() => tramiteCreateSchema.parse({ titulo: "x" }), /String/);

const updated = tramiteUpdateSchema.parse({
  estado: "cancelado",
  responsableId: null,
});
assert.equal(updated.estado, "cancelado");
assert.equal(updated.responsableId, null);

const doc = documentoUpdateSchema.parse({
  tipo: "contrato",
  confidencial: true,
  privilegio: false,
});
assert.equal(doc.tipo, "contrato");
assert.equal(doc.confidencial, true);

assert.equal(labelTramiteEstado("en_curso"), "En curso");
assert.equal(isTramiteVencido("en_curso", new Date("2000-01-01")), true);
assert.equal(labelConflictStatus("blocked"), "bloqueante");
assert.equal(labelConflictStatus("clear"), "sin hallazgos");
assert.equal(labelConflictSeverity("warning"), "advertencia");

console.log("tramites.api-contract.test.ts OK");
