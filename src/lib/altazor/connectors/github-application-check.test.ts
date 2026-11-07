import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGithubApplication } from "./github-application-check";

test("application preflight only checks an invalid synthetic token against the exact official endpoint", async () => {
  let calls = 0;
  await checkGithubApplication("fixture-client", "fictitious-private-secret", (async (url, init) => {
    calls++; assert.equal(url, "https://api.github.com/applications/fixture-client/token"); assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Basic ${Buffer.from("fixture-client:fictitious-private-secret").toString("base64")}`);
    assert.deepEqual(JSON.parse(String(init?.body)), { access_token: "0000000000000000000000000000000000000000" });
    return Response.json({ message: "Not Found" }, { status: 404 });
  }) as typeof fetch);
  assert.equal(calls, 1);
});
test("bad credentials and unavailable checks fail closed without leaking remote descriptions or retrying", async () => {
  for (const status of [200, 400, 401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(checkGithubApplication("fixture", "fictitious-private-secret", (async () => { calls++; return Response.json({ message: "fictitious-private-secret" }, { status }); }) as typeof fetch), cause => {
      const error = cause as { code: string; message: string }; assert.equal(error.code, status === 401 ? "oauth_client_credentials" : "oauth_application_check_unavailable"); assert.equal(error.message.includes("fictitious-private-secret"), false); return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(checkGithubApplication("fixture", "secret", (async () => { throw new Error("fictitious-private-secret"); }) as typeof fetch), error => (error as { code?: string }).code === "oauth_application_check_unavailable");
});
