import assert from "node:assert/strict";
import {
  TRAMITE_ESTADOS,
  TRAMITES_ABIERTOS,
  isTramiteAbierto,
  isTramiteEstado,
  isTramiteVencido,
  labelTramiteEstado,
} from "./tramites";

assert.ok(TRAMITE_ESTADOS.includes("pendiente"));
assert.ok(TRAMITE_ESTADOS.includes("hecho"));
assert.ok(TRAMITE_ESTADOS.includes("cancelado"));
assert.deepEqual(TRAMITES_ABIERTOS, ["pendiente", "en_curso"]);
assert.equal(isTramiteAbierto("pendiente"), true);
assert.equal(isTramiteAbierto("hecho"), false);
assert.equal(isTramiteAbierto("cancelado"), false);
assert.equal(isTramiteEstado("en_curso"), true);
assert.equal(isTramiteEstado("borrador"), false);
assert.equal(labelTramiteEstado("pendiente"), "Pendiente");
assert.equal(labelTramiteEstado("hecho"), "Hecho");
assert.equal(labelTramiteEstado("cancelado"), "Cancelado");

const now = new Date("2026-08-10T12:00:00.000Z");
assert.equal(
  isTramiteVencido("pendiente", "2026-08-01T00:00:00.000Z", now),
  true
);
assert.equal(
  isTramiteVencido("pendiente", "2026-08-20T00:00:00.000Z", now),
  false
);
assert.equal(isTramiteVencido("hecho", "2026-08-01T00:00:00.000Z", now), false);
assert.equal(isTramiteVencido("pendiente", null, now), false);

console.log("tramites.test.ts OK");
