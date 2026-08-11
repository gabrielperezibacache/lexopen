import assert from "node:assert/strict";
import { isValidBootstrapToken } from "@/lib/auth/bootstrap";
import { passwordChangeSchema } from "@/lib/schemas";

const token = "a".repeat(64);
assert.equal(isValidBootstrapToken(token, token), true);
assert.equal(isValidBootstrapToken(`${token}x`, token), false);
assert.equal(isValidBootstrapToken(token.slice(0, -1), token), false);
assert.equal(isValidBootstrapToken("", token), false);
assert.equal(isValidBootstrapToken(token, undefined), false);

assert.equal(
  passwordChangeSchema.safeParse({
    currentPassword: "old-password",
    newPassword: "new-password-2026",
  }).success,
  true
);
assert.equal(
  passwordChangeSchema.safeParse({
    currentPassword: "old-password",
    newPassword: "short",
  }).success,
  false
);

console.log("bootstrap.test.ts OK");
