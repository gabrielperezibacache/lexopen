import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mustEnrollTwoFactor } from "./two-factor-policy";

async function main() {
  // Next's matcher utility expects the runtime to expose AsyncLocalStorage.
  Object.assign(globalThis, { AsyncLocalStorage });
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const { config } = await import("@/proxy");
  for (const headers of [{}, { "next-router-prefetch": "1" }, { purpose: "prefetch" }]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/api/causas", headers }), true);
  }
  const previous = { NODE_ENV: process.env.NODE_ENV, LEXOPEN_E2E: process.env.LEXOPEN_E2E };
  try {
    Object.assign(process.env, { NODE_ENV: "production", LEXOPEN_E2E: "1" });
    assert.equal(mustEnrollTwoFactor({ role: "admin", totpEnabled: false, policyEnabled: true }), true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  console.log("proxy-boundary: protected prefetch and production enrollment OK");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
