import assert from "node:assert/strict";
import { buildCaseStatus } from "./status";
import { caseStatusReferences } from "./status-references";

const status = buildCaseStatus({ id: "visible-case", estado: "activa", etapa: "prueba", fechaNotificacion: null, pjudMonitoreoActivo: false, pjudLastSyncAt: null, pjudLastSyncStatus: null,
  plazos: [{ id: "due", titulo: "Presentar escrito", fechaLimite: new Date("2026-11-10"), estado: "pendiente", esFatal: true }],
  tramites: [{ id: "step", titulo: "Obtener respaldo", estado: "pendiente", fechaLimite: null, responsable: null }],
  movimientos: [{ id: "event", titulo: "Resolución", fecha: new Date("2026-11-01"), fuente: "pjud" }], pendientes: [],
  tasks: [{ id: "task", title: "Esperar al cliente", status: "waiting_client", waitingOn: "cliente", assignee: null }], taskCount: 1,
  _count: { plazos: 1, tramites: 1, movimientos: 0 },
});
const parts = caseStatusReferences("Atender [plazo:due], [tramite:step], [movimiento:event] y [tarea:task]. También [plazo:otro-usuario].", status);
assert.deepEqual(parts.filter(p => p.href).map(p => p.href), ["#plazos", "#tramites", "#actividad", "/tareas?causaId=visible-case"]);
assert.equal(parts.filter(p => p.unverified).length, 1);
assert.equal(parts.find(p => p.unverified)?.href, undefined);
assert.ok(parts.find(p => p.href === "#plazos")?.label?.includes("Presentar escrito"));
for (const text of ["[Abrir](https://malicioso.invalid)", "[plazo:javascript:alert(1)]", "<img src=x onerror=alert(1)>"]) {
  const parsed = caseStatusReferences(text, status);
  assert.equal(parsed.map(p => p.text).join(""), text);
  assert.ok(parsed.every(p => !p.href));
}
assert.deepEqual(caseStatusReferences("", status), []);
console.log("Case status citations: visible records only, unknown references marked, model URLs/HTML remain text.");
