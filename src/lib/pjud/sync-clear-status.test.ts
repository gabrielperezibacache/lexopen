import assert from "node:assert/strict";
import { labelSemaforo } from "./classify";
import { labelPjudSyncStatus } from "@/lib/pjud/causa-origin";

// Regression: limpiar avisos no debe etiquetarse como "Al día" (ok).
assert.equal(labelPjudSyncStatus("cleared"), "Limpiado");
assert.notEqual(labelPjudSyncStatus("cleared"), labelPjudSyncStatus("ok"));
assert.equal(labelPjudSyncStatus("ok"), "Consulta registrada");
assert.equal(labelPjudSyncStatus("unverified"), "Consulta sin comprobar");
assert.equal(labelSemaforo("verde"), "Movimiento reciente registrado");
assert.equal(labelPjudSyncStatus("failed"), "Fallido");

console.log("pjud/sync-clear-status.test.ts OK");
