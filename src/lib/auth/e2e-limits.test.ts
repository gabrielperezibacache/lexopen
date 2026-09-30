import assert from "node:assert/strict";
import {
  isE2eAuthRelaxed,
  loginEmailLimit,
  loginIpLimit,
} from "@/lib/auth/e2e-limits";

const prevNode = process.env.NODE_ENV;
const prevE2e = process.env.LEXOPEN_E2E;

try {
  process.env.NODE_ENV = "production";
  delete process.env.LEXOPEN_E2E;
  assert.equal(isE2eAuthRelaxed(), false);
  assert.equal(loginIpLimit(), 40);
  assert.equal(loginEmailLimit(), 10);

  process.env.LEXOPEN_E2E = "1";
  assert.equal(isE2eAuthRelaxed(), true);
  assert.equal(loginIpLimit(), 500);
  assert.equal(loginEmailLimit(), 200);

  delete process.env.LEXOPEN_E2E;
  process.env.NODE_ENV = "test";
  assert.equal(isE2eAuthRelaxed(), true);
  console.log("e2e-limits.test.ts OK");
} finally {
  if (prevNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNode;
  if (prevE2e === undefined) delete process.env.LEXOPEN_E2E;
  else process.env.LEXOPEN_E2E = prevE2e;
}
