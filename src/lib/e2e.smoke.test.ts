/**
 * Smoke e2e-ish checks without Playwright: session crypto + ACL path matrix + plazos.
 * Run via npm test.
 */
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "ci-session-secret-16plus";

import assert from "node:assert/strict";
import {
  buildSessionCookieValue,
  verifySessionToken,
  sessionSecret,
} from "@/lib/auth/session";
import { isClientAllowedPath } from "@/lib/auth/access";
import { calcularVencimiento } from "@/lib/plazos";
import { validarRit, validarRut } from "@/lib/chile";

assert.ok(sessionSecret().length >= 16);

const session = buildSessionCookieValue("user_smoke_1");
const parsed = verifySessionToken(session.value);
assert.ok(parsed);
assert.equal(parsed!.userId, "user_smoke_1");
assert.ok(parsed!.expiresAt > Date.now());

assert.equal(isClientAllowedPath("/portal"), true);
assert.equal(isClientAllowedPath("/sites/abc"), false);
assert.equal(isClientAllowedPath("/sites/abc/archivos"), true);
assert.equal(isClientAllowedPath("/sites/abc/qa"), true);
assert.equal(isClientAllowedPath("/causas"), false);
assert.equal(isClientAllowedPath("/facturacion/horas"), false);
assert.equal(isClientAllowedPath("/auditoria"), false);

assert.equal(validarRit("C-4521-2025"), true);
assert.equal(validarRut("11.111.111-1"), true);

const due = calcularVencimiento({
  desde: new Date(2026, 6, 20, 12), // Monday
  dias: 5,
  tipoComputo: "habiles",
});
assert.equal(due.getDay(), 1); // next Monday

console.log("e2e.smoke.test.ts OK");
