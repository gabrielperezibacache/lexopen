import assert from "node:assert/strict";
import { sessionVersionMatches } from "@/lib/auth/session-version";

const roles = new Set(["admin", "abogado", "asistente", "cliente"]);

assert.equal(
  sessionVersionMatches({ sessionVersion: 2, role: "admin" }, 2, roles).ok,
  true
);
assert.equal(
  sessionVersionMatches({ sessionVersion: 3, role: "admin" }, 2, roles).ok,
  false
);
assert.equal(sessionVersionMatches(null, 0, roles).ok, false);
assert.equal(
  sessionVersionMatches({ sessionVersion: 0, role: "nope" }, 0, roles).ok,
  false
);
assert.equal(
  sessionVersionMatches({ sessionVersion: 1, role: "cliente" }, 1, roles).ok,
  true
);

console.log("session-version.test.ts OK");
