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
assert.match(result.judicialSync.notice!, /consulta al PJUD fue parcial/);
const next = buildCaseStatus({ ...row, pendientes: [{ id: "writing", titulo: "Escrito", fecha: new Date("2026-11-01"), fuente: "pjud" }], _count: { ...row._count, movimientos: 22 } }, new Date("2026-11-10T12:00:00Z"));
assert.equal(next.deadlines.find(p => p.id === "closed")?.days, -1);
assert.equal(next.waiting[0].id, "writing");
assert.ok(next.missing.some(m => m.includes("selección")));
const empty = buildCaseStatus({ ...row, plazos: [], _count: { plazos: 0, tramites: 1, movimientos: 0 } });
assert.ok(empty.missing.some(m => m.includes("no confirma")));
const attemptedAt = new Date("2026-11-10T12:00:00Z");
const complete = { status: "complete", read: 1, total: 1, items: [{ key: "cuaderno:1", label: "Cuaderno privado", status: "ok", count: 0, note: "sesión privada" }] };
const sync = (status: string | null, coverage: unknown, enabled = true, at: Date | null = attemptedAt) =>
  buildCaseStatus({ ...row, pjudMonitoreoActivo: enabled, pjudLastSyncStatus: status, pjudLastSyncAt: at, pjudCuadernosCoverage: coverage }).judicialSync;
for (const failed of ["failed", "error"]) {
  const record = sync(failed, complete, false);
  assert.match(record.notice!, /Falló la última consulta/);
  assert.equal(record.coverage, "unknown");
  assert.equal(record.attemptedAt, attemptedAt.toISOString());
  assert.doesNotMatch(JSON.stringify(record), /Cuaderno privado|sesión privada/);
}
assert.equal(sync("partial", complete).coverage, "partial");
assert.match(sync("ok", null).notice!, /lectura completa/);
assert.match(sync("ok", { ...complete, read: 0 }).notice!, /lectura completa/);
assert.match(sync("ok", complete, true, null).notice!, /lectura completa/);
assert.equal(sync("ok", complete, true, null).coverage, "unknown");
assert.equal(sync("ok", complete).notice, null);
assert.equal(sync("ok", complete).coverage, "complete");
assert.match(sync("unverified", complete).notice!, /importados/);
assert.equal(sync("unverified", complete).attemptedAt, null);
assert.match(sync("demo", complete).notice!, /demostración/);
assert.equal(sync(null, null, false, null).notice, null);
assert.doesNotMatch(JSON.stringify(sync("token-privado", null)), /token-privado/);
console.log("Case status: Santiago dates, priorities, explicit waits, missing evidence and bounded coverage passed.");
