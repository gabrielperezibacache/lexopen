import assert from "node:assert/strict";
import {
  namesLikelyMatch,
  labelConflictStatus,
  summarizeConflictStatus,
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

console.log("conflict.test.ts: ok");
