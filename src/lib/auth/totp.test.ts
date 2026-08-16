import assert from "node:assert/strict";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  totpOtpauthUrl,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
} from "@/lib/auth/totp";

async function main() {
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);
  const code = generateTotpCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, "000000"), false);
  assert.match(
    totpOtpauthUrl({ secret, email: "a@b.cl" }),
    /^otpauth:\/\/totp\//
  );

  const codes = generateBackupCodes(4);
  assert.equal(codes.length, 4);
  const hashed = await hashBackupCodes(codes);
  const used = await consumeBackupCode(hashed, codes[0]!);
  assert.equal(used.ok, true);
  const reused = await consumeBackupCode(used.remainingJson, codes[0]!);
  assert.equal(reused.ok, false);

  console.log("totp.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
