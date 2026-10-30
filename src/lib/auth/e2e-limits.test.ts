import assert from "node:assert/strict";
import {
  isE2eAuthRelaxed,
  loginEmailLimit,
  loginIpLimit,
} from "@/lib/auth/e2e-limits";

const env = process.env as Record<string, string | undefined>;
const prevNode = env.NODE_ENV;
const prevE2e = env.LEXOPEN_E2E;

try {
  env.NODE_ENV = "production";
  delete env.LEXOPEN_E2E;
  assert.equal(isE2eAuthRelaxed(), false);
  assert.equal(loginIpLimit(), 40);
  assert.equal(loginEmailLimit(), 10);

  env.LEXOPEN_E2E = "1";
  assert.equal(isE2eAuthRelaxed(), true);
  assert.equal(loginIpLimit(), 500);
  assert.equal(loginEmailLimit(), 200);

  delete env.LEXOPEN_E2E;
  env.NODE_ENV = "test";
  assert.equal(isE2eAuthRelaxed(), true);
  console.log("e2e-limits.test.ts OK");
} finally {
  if (prevNode === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = prevNode;
  if (prevE2e === undefined) delete env.LEXOPEN_E2E;
  else env.LEXOPEN_E2E = prevE2e;
}
