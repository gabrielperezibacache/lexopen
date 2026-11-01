import assert from "node:assert/strict";

// Pure helpers: status mapping mirrors (inline to avoid DB).
function mapTramite(estado: string) {
  return (
    ({
      pendiente: "todo",
      en_curso: "in_progress",
      hecho: "done",
      cancelado: "cancelled",
    } as Record<string, string>)[estado] || "todo"
  );
}

function mapAccion(estado: string) {
  return (
    ({
      pendiente: "todo",
      en_curso: "in_progress",
      hecha: "done",
      cancelada: "cancelled",
    } as Record<string, string>)[estado] || "todo"
  );
}

assert.equal(mapTramite("hecho"), "done");
assert.equal(mapTramite("cancelado"), "cancelled");
assert.equal(mapAccion("hecha"), "done");
assert.equal(mapAccion("cancelada"), "cancelled");
assert.equal(mapAccion("en_curso"), "in_progress");

console.log("sync-mirrors.test.ts OK");
