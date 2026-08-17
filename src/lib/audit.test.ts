import assert from "node:assert/strict";
import { handleAuditWriteError, writeAudit, writeAuditStrict } from "@/lib/audit";

assert.equal(typeof writeAudit, "function");
assert.equal(typeof writeAuditStrict, "function");
assert.equal(typeof handleAuditWriteError, "function");

const silent = console.error;
console.error = () => {};
try {
  assert.doesNotThrow(() => handleAuditWriteError(new Error("db down"), false));
  assert.doesNotThrow(() => handleAuditWriteError(new Error("db down")));

  try {
    handleAuditWriteError(new Error("db down"), true);
    assert.fail("strict audit should throw");
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.match(e.message, /auditoría/);
    assert.equal((e as Error & { status?: number }).status, 500);
  }
} finally {
  console.error = silent;
}

console.log("audit.test.ts: ok");
