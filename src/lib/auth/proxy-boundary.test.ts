import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mustEnrollTwoFactor } from "./two-factor-policy";

async function main() {
  // Next's matcher utility expects the runtime to expose AsyncLocalStorage.
  Object.assign(globalThis, { AsyncLocalStorage });
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const { config, proxy } = await import("@/proxy");
  const { NextRequest } = await import("next/server");
  for (const headers of [{}, { "next-router-prefetch": "1" }, { purpose: "prefetch" }]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/api/causas", headers }), true);
  }
  const previous = { NODE_ENV: process.env.NODE_ENV, LEXOPEN_E2E: process.env.LEXOPEN_E2E };
  try {
    Object.assign(process.env, { NODE_ENV: "production", LEXOPEN_E2E: "1" });
    assert.equal(mustEnrollTwoFactor({ role: "admin", totpEnabled: false, policyEnabled: true }), true);
    // The system browser has no Electron session cookie. Only the exact GET
    // callback reaches its one-use state/PKCE capture; account claiming stays authenticated.
    const callback = "/api/altazor/connectors/oauth/callback";
    const request = new NextRequest(`http://localhost:3000${callback}?state=${"s".repeat(43)}&code=fictitious-code`);
    assert.equal(request.cookies.get("lexopen_session"), undefined);
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: request.url }), true);
    const forwarded = await proxy(request);
    assert.equal(forwarded.headers.get("x-middleware-next"), "1", "a cookie-free system browser callback must reach the route handler");
    assert.equal(forwarded.status, 200);
    for (const [path, method] of [
      [callback, "POST"], [callback, "HEAD"], [callback, "PUT"],
      [`${callback}/other`, "GET"], [`${callback}/`, "GET"],
      ["/api/altazor/connectors/oauth", "GET"], ["/api/altazor/connectors/oauth/start", "POST"],
      ["/api/altazor/connectors/oauth/device", "POST"], ["/api/altazor/connectors/oauth/setup", "GET"],
    ]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`, { method }));
      assert.equal(response.status, 401, `${method} ${path} must remain session-bound`);
      assert.equal(response.headers.get("x-middleware-next"), null);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  console.log("proxy-boundary: protected prefetch, production enrollment and exact cookie-free GET OAuth callback OK");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
