import assert from "node:assert/strict";
import { buildCaseStatus, type CaseStatusInput } from "./status";

const row: CaseStatusInput = { id: "fixture", estado: "activa", etapa: "sentencia", fechaNotificacion: null, pjudLastSyncAt: null, pjudLastSyncStatus: "partial", pjudMonitoreoActivo: true,
  plazos: [
    { id: "closed", titulo: "Hoy", fechaLimite: new Date("2026-11-09"), estado: "pendiente", esFatal: true },
    { id: "tomorrow", titulo: "Mañana", fechaLimite: new Date("2026-11-10T21:00:00Z"), estado: "pendiente", esFatal: false },
    { id: "past", titulo: "Ayer", fechaLimite: new Date("2026-11-08"), estado: "pendiente", esFatal: false },
  ], tramites: [{ id: "step", titulo: "Pedir antecedente", estado: "en_curso", fechaLimite: null, responsable: null }], movimientos: [], pendientes: [], _count: { plazos: 3, tramites: 1, movimientos: 0 },
};
// UTC has already changed day; Chile has not. Date-only deadlines retain their selected day.
const result = buildCaseStatus(row, new Date("2026-11-10T01:00:00Z"));
assert.equal(result.today, "2026-11-09");
assert.deepEqual(result.deadlines.map(p => p.days), [-1, 0, 1]);
assert.equal(result.waiting.length, 0, "An etapa must not invent a pending sentence");
assert.match(result.needs[0].title, /Revisar vencimiento/);
assert.ok(result.needs.some(n => n.title.includes("Atender hoy")));
assert.ok(result.needs.some(n => n.title.includes("asignar responsable")));
assert.ok(result.missing.some(m => m.includes("notificación")));
assert.ok(result.missing.some(m => m.includes("completa")));
const next = buildCaseStatus({ ...row, pendientes: [{ id: "writing", titulo: "Escrito", fecha: new Date("2026-11-01"), fuente: "pjud" }], _count: { ...row._count, movimientos: 22 } }, new Date("2026-11-10T12:00:00Z"));
assert.equal(next.deadlines.find(p => p.id === "closed")?.days, -1);
assert.equal(next.waiting[0].id, "writing");
assert.ok(next.missing.some(m => m.includes("selección")));
const empty = buildCaseStatus({ ...row, plazos: [], _count: { plazos: 0, tramites: 1, movimientos: 0 } });
assert.ok(empty.missing.some(m => m.includes("no confirma")));
console.log("Case status: Santiago dates, priorities, explicit waits, missing evidence and bounded coverage passed.");
