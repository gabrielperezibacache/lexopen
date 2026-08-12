import assert from "node:assert/strict";
import { safeAppPath } from "@/lib/auth/safe-next";

assert.equal(safeAppPath("/dashboard"), "/dashboard");
assert.equal(safeAppPath("/causas/abc"), "/causas/abc");
assert.equal(safeAppPath("//evil.com"), "/dashboard");
assert.equal(safeAppPath("https://evil.com"), "/dashboard");
assert.equal(safeAppPath(null), "/dashboard");
assert.equal(safeAppPath("/portal", "/portal"), "/portal");
assert.equal(safeAppPath("/login?next=/dashboard"), "/login?next=/dashboard");
assert.equal(safeAppPath("/dash\tboard"), "/dashboard");
assert.equal(safeAppPath("/\\evil"), "/dashboard");
assert.equal(safeAppPath("/%2f%2fevil.com"), "/dashboard");
assert.equal(safeAppPath("/ok#section"), "/ok#section");

console.log("safe-next.test.ts OK");
