import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rateLimit, rateLimitAuthFailure } from "@/lib/auth/rate-limit";

const prevPath = process.env.LEXOPEN_RATE_LIMIT_PATH;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-rl-"));
process.env.LEXOPEN_RATE_LIMIT_PATH = path.join(tmp, "rate-limit.json");

const key = `test-${Date.now()}`;
assert.equal(rateLimit(key, 2, 60_000).ok, true);
assert.equal(rateLimit(key, 2, 60_000).ok, true);
assert.equal(rateLimit(key, 2, 60_000).ok, false);

const failKey = `fail-${Date.now()}`;
for (let i = 0; i < 8; i++) {
  assert.equal(rateLimitAuthFailure(failKey, { softLimit: 8 }).ok, true);
}
assert.equal(rateLimitAuthFailure(failKey, { softLimit: 8 }).ok, false);

if (prevPath === undefined) delete process.env.LEXOPEN_RATE_LIMIT_PATH;
else process.env.LEXOPEN_RATE_LIMIT_PATH = prevPath;
fs.rmSync(tmp, { recursive: true, force: true });

console.log("rate-limit.test.ts OK");
