import assert from "node:assert/strict";
import {
  namesLikelyMatch,
  labelConflictStatus,
  summarizeConflictStatus,
  sanitizeConflictHits,
} from "@/lib/conflict";

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
