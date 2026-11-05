import assert from "node:assert/strict";
import {
  namesLikelyMatch,
  labelConflictStatus,
  summarizeConflictStatus,
  sanitizeConflictHits,
  partyIdentifiersMatch,
} from "@/lib/conflict";

assert.equal(partyIdentifiersMatch("AB123456", "CD123456"), false, "distinct international identifiers retain their letters");
assert.equal(partyIdentifiersMatch("ab123456", "AB123456"), true, "complete identifier comparison is case insensitive");
assert.equal(partyIdentifiersMatch("AB.123456", "AB123456"), false, "foreign punctuation is not discarded");
assert.equal(partyIdentifiersMatch("123456789", "12.345.678-9"), false, "invalid RUT-shaped identifiers have no Chilean alias");
assert.equal(partyIdentifiersMatch("12.345.678-5", "123456785"), true, "genuine legacy RUTs preserve their formatting equivalence");
assert.equal(partyIdentifiersMatch("AB123456785", "12.345.678-5"), false, "a passport prefix never becomes a RUT");
assert.equal(partyIdentifiersMatch("12.345.678–5", "12345678-5"), true, "a genuine RUT with a typographic dash remains equivalent");
assert.equal(partyIdentifiersMatch("", ""), false);

assert.equal(namesLikelyMatch("Juan Pérez Soto", "Juan Perez Soto"), true);
assert.equal(namesLikelyMatch("Sociedad Andes SpA", "Andes SpA"), true);
assert.equal(namesLikelyMatch("Ana", "Ana María"), false);
assert.equal(namesLikelyMatch("Pedro Gómez", "María López"), false);
assert.equal(labelConflictStatus("blocked"), "bloqueante");
assert.equal(
  summarizeConflictStatus([{ severity: "blocked" } as never]),
  "blocked"
);
assert.equal(
  summarizeConflictStatus([{ severity: "warning" } as never]),
  "warning"
);
assert.equal(summarizeConflictStatus([]), "clear");
const hidden = { causaId: "private-id", titulo: "Secret title", rit: "C-PRIVATE", match: "Private party name", severity: "blocked" as const };
const visible = { causaId: "visible-id", titulo: "Visible title", rit: null, match: "Visible match", severity: "warning" as const };
const restricted = sanitizeConflictHits([hidden, { ...hidden, causaId: "second-private-id" }, visible], new Set(["visible-id"]));
assert.equal(restricted.hasRestrictedMatch, true);
assert.equal(restricted.status, "blocked", "hidden matches still block an unsafe clearance");
assert.deepEqual(restricted.conflicts, [visible]);
assert.equal(restricted.notice, "Coincidencia reservada: requiere revisión de un socio autorizado");
assert.doesNotMatch(JSON.stringify(restricted), /private-id|Secret title|C-PRIVATE|Private party/);
assert.deepEqual(sanitizeConflictHits([hidden], new Set()), sanitizeConflictHits([hidden, { ...hidden, causaId: "another-hidden" }], new Set()), "no hidden match count is exposed");
assert.deepEqual(sanitizeConflictHits([visible], new Set(["visible-id"])).conflicts, [visible]);

console.log("conflict.test.ts: ok");
