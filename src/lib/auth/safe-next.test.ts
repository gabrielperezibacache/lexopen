import assert from "node:assert/strict";
import { safeAppPath } from "@/lib/auth/safe-next";
import { homePathForRole, resolvePostLoginPath } from "@/lib/auth/home-path";

assert.equal(safeAppPath("/inicio"), "/inicio");
assert.equal(safeAppPath("/dashboard"), "/dashboard");
assert.equal(safeAppPath("/causas/abc"), "/causas/abc");
assert.equal(safeAppPath("//evil.com"), "/inicio");
assert.equal(safeAppPath("https://evil.com"), "/inicio");
assert.equal(safeAppPath(null), "/inicio");
assert.equal(safeAppPath("/portal", "/portal"), "/portal");
assert.equal(safeAppPath("/login?next=/inicio"), "/login?next=/inicio");
assert.equal(safeAppPath("/dash\tboard"), "/inicio");
assert.equal(safeAppPath("/\\evil"), "/inicio");
assert.equal(safeAppPath("/%2f%2fevil.com"), "/inicio");
assert.equal(safeAppPath("/ok#section"), "/ok#section");

assert.equal(homePathForRole("admin"), "/inicio");
assert.equal(homePathForRole("abogado"), "/inicio");
assert.equal(homePathForRole("asistente"), "/inicio");
assert.equal(homePathForRole("cliente"), "/portal");

assert.equal(resolvePostLoginPath("abogado", null), "/inicio");
assert.equal(resolvePostLoginPath("abogado", "/dashboard"), "/inicio");
assert.equal(resolvePostLoginPath("abogado", "/causas/x"), "/causas/x");
assert.equal(resolvePostLoginPath("cliente", "/inicio"), "/portal");
assert.equal(resolvePostLoginPath("cliente", "/dashboard"), "/portal");
assert.equal(resolvePostLoginPath("cliente", "/portal"), "/portal");

console.log("safe-next.test.ts OK");
