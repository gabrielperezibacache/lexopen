import assert from "node:assert/strict";
import {
  classifyMovimiento,
  diasEntre,
  labelMovimientoTipo,
  semaforoPorDiasSinMovimiento,
} from "./classify";

assert.equal(classifyMovimiento("Citación a audiencia de conciliación").tipo, "audiencia");
assert.equal(classifyMovimiento("Citación a audiencia").relevante, true);
assert.equal(classifyMovimiento("Proveído: téngase presente").tipo, "proveido");
assert.equal(classifyMovimiento("Sentencia definitiva").tipo, "resolucion");
assert.equal(classifyMovimiento("Certificado de notificación").tipo, "notificacion");
assert.equal(classifyMovimiento("Escrito de contestación").tipo, "escrito");
assert.equal(classifyMovimiento("Escrito de contestación").relevante, false);
assert.equal(
  classifyMovimiento("Escrito por resolver — demanda principal").tipo,
  "escrito"
);
assert.equal(
  classifyMovimiento("Escrito por resolver — demanda principal").relevante,
  true
);
assert.equal(
  classifyMovimiento("Escrito por resolver — demanda principal")
    .pendienteResolucion,
  true
);
assert.equal(classifyMovimiento("Plazo fatal de 5 días hábiles").tipo, "plazo");
assert.equal(classifyMovimiento("Otros antecedentes").tipo, "otro");

assert.equal(labelMovimientoTipo("audiencia"), "Audiencia");
assert.equal(semaforoPorDiasSinMovimiento(null), "gris");
assert.equal(semaforoPorDiasSinMovimiento(3), "verde");
assert.equal(semaforoPorDiasSinMovimiento(14), "amarillo");
assert.equal(semaforoPorDiasSinMovimiento(30), "rojo");

const from = new Date(2026, 6, 20, 12);
const to = new Date(2026, 6, 25, 18);
assert.equal(diasEntre(from, to), 5);

console.log("pjud/classify.test.ts OK");
