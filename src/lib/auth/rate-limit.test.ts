import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  rateLimit,
  rateLimitAsync,
  rateLimitAuthFailure,
} from "@/lib/auth/rate-limit";

async function main() {
  const prevPath = process.env.LEXOPEN_RATE_LIMIT_PATH;
  const prevRedis = process.env.REDIS_URL;
  const prevRateRedis = process.env.RATE_LIMIT_REDIS_URL;
  const prevUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-rl-"));
  process.env.LEXOPEN_RATE_LIMIT_PATH = path.join(tmp, "rate-limit.json");
  // Force local store in unit tests (no remote Redis).
  delete process.env.REDIS_URL;
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const key = `test-${Date.now()}`;
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, false);

  const asyncKey = `async-${Date.now()}`;
  assert.equal((await rateLimitAsync(asyncKey, 2, 60_000)).ok, true);
  assert.equal((await rateLimitAsync(asyncKey, 2, 60_000)).ok, true);
  assert.equal((await rateLimitAsync(asyncKey, 2, 60_000)).ok, false);

  const failKey = `fail-${Date.now()}`;
  for (let i = 0; i < 8; i++) {
    assert.equal(
      (await rateLimitAuthFailure(failKey, { softLimit: 8 })).ok,
      true
    );
  }
  assert.equal(
    (await rateLimitAuthFailure(failKey, { softLimit: 8 })).ok,
    false
  );

  if (prevPath === undefined) delete process.env.LEXOPEN_RATE_LIMIT_PATH;
  else process.env.LEXOPEN_RATE_LIMIT_PATH = prevPath;
  if (prevRedis === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = prevRedis;
  if (prevRateRedis === undefined) delete process.env.RATE_LIMIT_REDIS_URL;
  else process.env.RATE_LIMIT_REDIS_URL = prevRateRedis;
  if (prevUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = prevUpstashUrl;
  if (prevUpstashToken === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = prevUpstashToken;
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("rate-limit.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
