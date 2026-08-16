import assert from "node:assert/strict";
import { writeAudit, writeAuditStrict } from "@/lib/audit";

assert.equal(typeof writeAudit, "function");
assert.equal(typeof writeAuditStrict, "function");

console.log("audit.test.ts: ok");
