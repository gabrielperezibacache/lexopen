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
  const previous = { NODE_ENV: process.env.NODE_ENV, LEXOPEN_E2E: process.env.LEXOPEN_E2E, SESSION_SECRET: process.env.SESSION_SECRET };
  try {
    Object.assign(process.env, { NODE_ENV: "production", LEXOPEN_E2E: "1", SESSION_SECRET: "proxy-delegated-admin-fixture-secret-32" });
    assert.equal(mustEnrollTwoFactor({ role: "admin", totpEnabled: false, policyEnabled: true }), true);

    const { prisma } = await import("@/lib/db");
    const { signSessionToken } = await import("./session");
    let subject = { role: "abogado", sessionVersion: 0, totpEnabled: false, capabilityGrants: "host.admin", capabilityRevokes: "" };
    // Mimic a DB select so dropping grants from the proxy query breaks this test.
    let useFixtures = true;
    prisma.$use(async (params, next) => {
      if (useFixtures && params.model === "User" && params.action === "findUnique") {
        return Object.fromEntries(Object.keys(params.args.select || {}).map(key => [key, subject[key as keyof typeof subject]]));
      }
      if (useFixtures && params.model === "FirmSettings" && params.action === "findFirst") return { require2faPrivileged: true };
      return next(params);
    });
    try {
      const request = () => new NextRequest("http://localhost/api/admin/host-status", { headers: { cookie: `lexopen_session=${signSessionToken("delegate", Date.now() + 60_000, 0, subject.role)}` } });
      let response = await proxy(request());
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "2fa_required", "host.admin delegado se comprueba también antes del handler");

      subject = { ...subject, capabilityRevokes: "host.admin" };
      response = await proxy(request());
      assert.equal(response.headers.get("x-middleware-next"), "1", "el grant revocado no obliga al usuario sin privilegios a enrolarse");

      subject = { ...subject, capabilityRevokes: "", totpEnabled: true };
      response = await proxy(request());
      assert.equal(response.headers.get("x-middleware-next"), "1");

      subject = { ...subject, role: "cliente", totpEnabled: false };
      response = await proxy(request());
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, undefined, "un cliente con grant no entra en la administración ni se trata como Host admin");
    } finally {
      useFixtures = false;
    }
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
  console.log("proxy-boundary: protected prefetch, delegated admin enrollment, portal boundary and exact cookie-free GET OAuth callback OK");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
