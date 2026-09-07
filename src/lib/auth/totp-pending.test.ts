import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  mintTotpPendingToken,
  verifyTotpPendingToken,
  TOTP_PENDING_COOKIE,
} from "@/lib/auth/totp-pending";

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "ci-session-secret-16plus-chars";

const token = mintTotpPendingToken("user-abc");
assert.ok(token.includes("user-abc"));
const ok = verifyTotpPendingToken(token);
assert.deepEqual(ok, { userId: "user-abc" });

assert.equal(verifyTotpPendingToken("bad.token.here"), null);
assert.equal(verifyTotpPendingToken(""), null);
assert.equal(verifyTotpPendingToken(null), null);

// Tampered signature
const parts = token.split(".");
parts[2] = "0".repeat(parts[2]!.length);
assert.equal(verifyTotpPendingToken(parts.join(".")), null);

assert.equal(TOTP_PENDING_COOKIE, "lexopen_totp_pending");

/** Contract shape expected by login when TOTP is enabled. */
const loginNeedsTotpResponse = {
  ok: true,
  needsTotp: true,
  message: "Ingrese el código de autenticación en dos pasos",
};
assert.equal(loginNeedsTotpResponse.needsTotp, true);
assert.equal(typeof loginNeedsTotpResponse.message, "string");

const originalSessionSecret = process.env.SESSION_SECRET;
try {
  delete process.env.SESSION_SECRET;
  const legacyPayload = `user-no-secret.${Date.now() + 300_000}`;
  const legacySignature = createHmac(
    "sha256",
    "lexopen-dev-session-secret-change-me"
  )
    .update(legacyPayload)
    .digest("hex");
  assert.equal(
    verifyTotpPendingToken(`${legacyPayload}.${legacySignature}`),
    null,
    "known development fallback must not authenticate a pending TOTP token"
  );
  assert.throws(
    () => mintTotpPendingToken("user-no-secret"),
    /SESSION_SECRET/,
    "minting must fail closed when SESSION_SECRET is missing"
  );
} finally {
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
}

console.log("totp-pending.test.ts: ok");
