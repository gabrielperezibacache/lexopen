/**
 * Contratos ligeros sin levantar el servidor: helpers usados por la API.
 */
import {
  ACCIONES_ABIERTAS,
  isValidEstadoAccion,
  isValidPrioridad,
  mapPrioridadToTask,
  parseLocalDateInput,
} from "./minutas";
import {
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
} from "./integrations/drive-folder";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(ACCIONES_ABIERTAS.includes("pendiente"), "pendiente abierta");
assert(ACCIONES_ABIERTAS.includes("en_curso"), "en_curso abierta");
assert(!ACCIONES_ABIERTAS.includes("hecha" as never), "hecha no abierta");
assert(!ACCIONES_ABIERTAS.includes("cancelada" as never), "cancelada no abierta");

assert(isValidEstadoAccion("hecha"), "estado hecha");
assert(!isValidEstadoAccion("done"), "estado inglés inválido");
assert(isValidPrioridad("urgente"), "prioridad");
assert(mapPrioridadToTask("urgente") === "urgent", "map urgent");
assert(mapPrioridadToTask("alta") === "high", "map high");

const d = parseLocalDateInput("2026-12-31");
assert(d?.getDate() === 31, "no UTC shift on Dec 31");

assert(isPlaceholderDriveFolderId("demo-folder-x"), "demo placeholder");
assert(!isRealDriveFolderId("demo-folder-x"), "demo not real for upload");
assert(isRealDriveFolderId("1aBcDeFgHiJkLmNoPqRs"), "looks like real id");

console.log("minutas.api-contract.test.ts OK");
