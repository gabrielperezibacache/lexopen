import assert from "node:assert/strict";
import {
  TRAMITE_ESTADOS,
  TRAMITES_ABIERTOS,
  isTramiteAbierto,
  isTramiteEstado,
  labelTramiteEstado,
} from "./tramites";

assert.ok(TRAMITE_ESTADOS.includes("pendiente"));
assert.ok(TRAMITE_ESTADOS.includes("hecho"));
assert.deepEqual(TRAMITES_ABIERTOS, ["pendiente", "en_curso"]);
assert.equal(isTramiteAbierto("pendiente"), true);
assert.equal(isTramiteAbierto("hecho"), false);
assert.equal(isTramiteEstado("en_curso"), true);
assert.equal(isTramiteEstado("borrador"), false);
assert.equal(labelTramiteEstado("pendiente"), "Pendiente");
assert.equal(labelTramiteEstado("hecho"), "Hecho");

console.log("tramites.test.ts OK");
