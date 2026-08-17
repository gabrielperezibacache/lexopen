import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAuditWriteError, writeAudit, writeAuditStrict } from "@/lib/audit";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function routeUsesStrict(relativePath: string) {
  const full = path.join(repoRoot, relativePath);
  const src = fs.readFileSync(full, "utf8");
  assert.match(src, /writeAuditStrict\(/);
  assert.doesNotMatch(src, /\bwriteAudit\(/);
}

assert.equal(typeof writeAudit, "function");
assert.equal(typeof writeAuditStrict, "function");
assert.equal(typeof handleAuditWriteError, "function");

for (const route of [
  "src/app/api/admin/self-update/route.ts",
  "src/app/api/integrations/pjud/webhook/route.ts",
  "src/app/api/sites/[id]/wiki/route.ts",
  "src/app/api/sites/[id]/blog/route.ts",
  "src/app/api/sites/[id]/isheets/route.ts",
  "src/app/api/integrations/hermes/route.ts",
]) {
  routeUsesStrict(route);
}

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
