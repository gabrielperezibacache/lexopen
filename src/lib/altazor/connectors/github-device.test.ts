import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { pollGithubDevice, requestGithubDevice } from "./github-device";
import { readOAuthTokenResponse } from "./oauth-token-response";

const clientId = "Ov23.fictitious-public-client";
const deviceCode = "fictitious-device-code-0123456789";
const challenge = () => ({ device_code: deviceCode, user_code: "AB12-CD34", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
const json = (value: unknown, status = 200) => Response.json(value, { status });
const fake = (value: unknown, status = 200): typeof fetch => async () => json(value, status);
const isSafe = (code: string) => (error: unknown) => error instanceof ConnectorError && error.code === code && !/fictitious-private|private\.invalid|reflected-secret/.test(error.message);

test("device authorization uses only the official endpoint, public client and explicit scopes", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, "https://github.com/login/device/code"); assert.equal(options?.method, "POST"); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store"); assert.equal(options?.credentials, "omit");
    assert.ok(options?.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false);
    const headers = new Headers(options.headers); assert.equal(headers.get("accept"), "application/json"); assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded"); assert.equal(headers.get("authorization"), null);
    const body = new URLSearchParams(String(options.body)); assert.deepEqual([...body.keys()].sort(), ["client_id", "scope"]); assert.equal(body.get("client_id"), clientId); assert.equal(body.get("scope"), "read:user");
    return json({ ...challenge(), ignored_private_field: "fictitious-private-never-project" });
  };
  assert.deepEqual(await requestGithubDevice(clientId, ["read:user"], fetcher), { deviceCode, userCode: "AB12-CD34", verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 5 });
  assert.equal(calls, 1);
});

test("challenges reject invalid TTL, interval, codes and any alternate verification URL", async () => {
  for (const change of [
    { expires_in: 59 }, { expires_in: 901 }, { expires_in: 60.5 }, { expires_in: "900" },
    { interval: 4 }, { interval: 61 }, { interval: 5.5 }, { interval: "5" },
    { user_code: "ab12-CD34" }, { user_code: "AB12-CD34-extra" }, { user_code: "AB12\nCD34" },
    { device_code: "short" }, { device_code: deviceCode + "\n" },
    { verification_uri: "https://github.com/login/device?user_code=AB12-CD34" },
    { verification_uri: "https://github.com/login/device/" }, { verification_uri: "https://github.com.attacker.invalid/login/device" },
  ]) await assert.rejects(requestGithubDevice(clientId, ["read:user"], fake({ ...challenge(), ...change })), isSafe("github_device_response"));
  assert.equal((await requestGithubDevice(clientId, ["read:user"], fake({ ...challenge(), expires_in: 60, interval: 60 }))).expiresIn, 60);
});

test("invalid local inputs never reach a provider", async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; throw Error("unexpected provider call"); };
  for (const id of ["", "bad\nclient", "https://github.com", "x".repeat(201)]) await assert.rejects(requestGithubDevice(id, ["read:user"], fetcher), isSafe("github_device_invalid"));
  for (const scopes of [[], ["read:user", "read:user"], ["read:user\nrepo"], [""], Array.from({ length: 21 }, (_, i) => `scope${i}`)]) await assert.rejects(requestGithubDevice(clientId, scopes, fetcher), isSafe("github_device_invalid"));
  await assert.rejects(pollGithubDevice(clientId, "bad\ncode", fetcher), isSafe("github_device_invalid")); assert.equal(calls, 0);
});

test("polling is a single form request and projects only the authorization state", async () => {
  for (const [error, state] of [["authorization_pending", "pending"], ["slow_down", "slow_down"], ["access_denied", "denied"], ["expired_token", "expired"]] as const) {
    let calls = 0;
    const fetcher: typeof fetch = async (url, options) => {
      calls++; assert.equal(url, "https://github.com/login/oauth/access_token"); assert.equal(options?.redirect, "error"); assert.equal(options?.method, "POST");
      const body = new URLSearchParams(String(options.body)); assert.deepEqual([...body.keys()].sort(), ["client_id", "device_code", "grant_type"]); assert.equal(body.get("device_code"), deviceCode); assert.equal(body.get("client_id"), clientId); assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
      return json({ error, error_description: "reflected-secret-private", error_uri: "https://private.invalid/?token=fictitious-private" }, 400);
    };
    assert.deepEqual(await pollGithubDevice(clientId, deviceCode, fetcher), { state }); assert.equal(calls, 1);
  }
});

test("authorized tokens remain server-side and granted-scope validation stays with the OAuth reader", async () => {
  const tokens = { access_token: "fictitious-private-access", token_type: "bearer", scope: "read:user" };
  const result = await pollGithubDevice(clientId, deviceCode, fake({ ...tokens, ignored_private_field: "never-project", error_description: "reflected-secret-private" }));
  assert.equal(result.state, "authorized"); if (result.state !== "authorized") return;
  assert.deepEqual(result.tokenResponse, tokens); assert.deepEqual(readOAuthTokenResponse(result.tokenResponse, ["read:user"]), { accessToken: tokens.access_token, scopes: ["read:user"] });
  const wrongScope = await pollGithubDevice(clientId, deviceCode, fake({ ...tokens, scope: "repo" })); assert.equal(wrongScope.state, "authorized");
  if (wrongScope.state === "authorized") assert.throws(() => readOAuthTokenResponse(wrongScope.tokenResponse, ["read:user"]), isSafe("oauth_scope_mismatch"));
  await assert.rejects(pollGithubDevice(clientId, deviceCode, fake({ error: "authorization_pending", ...tokens })), isSafe("github_device_response"));
});

test("expiring device tokens preserve the rotation pair without inventing additional scopes", async () => {
  const tokens = { access_token: "fictitious-private-access", refresh_token: "fictitious-private-refresh", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer", scope: "read:user" };
  const result = await pollGithubDevice(clientId, deviceCode, fake({ ...tokens, ignored_private_field: "never-project" }));
  assert.equal(result.state, "authorized");
  if (result.state !== "authorized") return;
  assert.deepEqual(result.tokenResponse, tokens);
  assert.deepEqual(readOAuthTokenResponse(result.tokenResponse, ["read:user"]), { accessToken: tokens.access_token, scopes: ["read:user"] });
});

test("invalid clients, disabled device flow and other errors have fixed safe messages", async () => {
  for (const [error, code] of [["incorrect_client_credentials", "oauth_client_credentials"], ["invalid_client", "oauth_client_credentials"], ["device_flow_disabled", "github_device_unavailable"], ["device_flow_not_enabled", "github_device_unavailable"], ["incorrect_device_code", "oauth_code_rejected"], ["unexpected_provider_error", "github_device_unavailable"]]) {
    const fetcher = fake({ error, error_description: "fictitious-private-token reflected-secret", error_uri: "https://private.invalid" }, 400);
    await assert.rejects(requestGithubDevice(clientId, ["read:user"], fetcher), isSafe(code)); await assert.rejects(pollGithubDevice(clientId, deviceCode, fetcher), isSafe(code));
  }
});

test("transport rejects redirects, non-JSON, excessive declared or streamed bodies and malformed JSON", async () => {
  const providers: (typeof fetch)[] = [
    async () => new Response("fictitious-private", { status: 302, headers: { Location: "https://private.invalid" } }),
    async () => new Response("fictitious-private", { headers: { "Content-Type": "text/html" } }),
    async () => new Response("fictitious-private", { headers: { "Content-Type": "application/json", "Content-Length": "65537" } }),
    async () => new Response("x".repeat(65537), { headers: { "Content-Type": "application/json" } }),
    async () => new Response("not-json fictitious-private", { headers: { "Content-Type": "application/json" } }),
    fake([]), fake(null),
  ];
  for (const fetcher of providers) await assert.rejects(requestGithubDevice(clientId, ["read:user"], fetcher), isSafe("github_device_response"));
});

test("network failures and temporary service failures never echo request data", async () => {
  const failures: (typeof fetch)[] = [async () => { throw Error("fictitious-private-device reflected-secret"); }, async () => { throw new ConnectorError("upstream_error", "fictitious-private-device reflected-secret", 400); }, async () => new Response("fictitious-private", { status: 503 }), async () => new Response("fictitious-private", { status: 429 })];
  for (const fetcher of failures) await assert.rejects(pollGithubDevice(clientId, deviceCode, fetcher), isSafe("github_device_unavailable"));
  const reflected: typeof fetch = async () => { throw new ConnectorError("github_device_response", "fictitious-private-device reflected-secret", 400); };
  await assert.rejects(pollGithubDevice(clientId, deviceCode, reflected), isSafe("github_device_response"));
});
