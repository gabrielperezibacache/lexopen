import assert from "node:assert/strict";
import { labelPjudSyncStatus } from "@/lib/pjud/causa-origin";

// Regression: limpiar avisos no debe etiquetarse como "Al día" (ok).
assert.equal(labelPjudSyncStatus("cleared"), "Limpiado");
assert.notEqual(labelPjudSyncStatus("cleared"), labelPjudSyncStatus("ok"));
assert.equal(labelPjudSyncStatus("ok"), "Al día");
assert.equal(labelPjudSyncStatus("failed"), "Fallido");

console.log("pjud/sync-clear-status.test.ts OK");
