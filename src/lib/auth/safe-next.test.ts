import assert from "node:assert/strict";
import { safeAppPath } from "@/lib/auth/safe-next";

assert.equal(safeAppPath("/dashboard"), "/dashboard");
assert.equal(safeAppPath("/causas/abc"), "/causas/abc");
assert.equal(safeAppPath("//evil.com"), "/dashboard");
assert.equal(safeAppPath("https://evil.com"), "/dashboard");
assert.equal(safeAppPath(null), "/dashboard");
assert.equal(safeAppPath("/portal", "/portal"), "/portal");

console.log("safe-next.test.ts OK");
