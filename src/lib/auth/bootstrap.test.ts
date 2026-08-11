import assert from "node:assert/strict";
import { isValidBootstrapToken } from "@/lib/auth/bootstrap";

const token = "a".repeat(64);
assert.equal(isValidBootstrapToken(token, token), true);
assert.equal(isValidBootstrapToken(`${token}x`, token), false);
assert.equal(isValidBootstrapToken(token.slice(0, -1), token), false);
assert.equal(isValidBootstrapToken("", token), false);
assert.equal(isValidBootstrapToken(token, undefined), false);

console.log("bootstrap.test.ts OK");
