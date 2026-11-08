import assert from "node:assert/strict";
import { test } from "node:test";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { OAUTH_PROVIDER_RESPONSE_MAX_BYTES, OAUTH_PROVIDER_RESPONSE_TIMEOUT_MS, requestOAuthProviderJson, type OAuthProviderStage } from "./oauth-provider-response";

const secret = "fictitious-private-token-and-description";
const endpoint = `https://official.invalid/private?code=${secret}`;
function responseFetcher(response: Response): typeof fetch { return (async (_url, init) => {
  assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal instanceof AbortSignal); return response;
}) as typeof fetch; }
async function rejectsSafely(stage: OAuthProviderStage, fetcher: typeof fetch, expected: string) {
  await assert.rejects(requestOAuthProviderJson(stage, endpoint, { headers: { Authorization: `Bearer ${secret}` } }, fetcher), error => {
    assert.ok(error instanceof ConnectorError); assert.equal(error.code, expected);
    for (const view of [String(error), JSON.stringify(error), String(error.stack), String((error as Error & { cause?: unknown }).cause)]) {
      assert.equal(view.includes(secret), false); assert.equal(view.includes("official.invalid"), false);
      assert.equal(view.includes("Authorization"), false);
    }
    assert.equal((error as Error & { cause?: unknown }).cause, undefined); return true;
  });
}
test("OAuth token HTTP errors use existing exact allowlisted mappings without remote descriptions", async () => {
  for (const [error, code] of [["invalid_client", "oauth_client_credentials"], ["invalid_grant", "oauth_code_rejected"], ["redirect_uri_mismatch", "oauth_callback_mismatch"], ["access_denied", "oauth_cancelled"]]) {
    await rejectsSafely("token", responseFetcher(Response.json({ error, error_description: secret, error_uri: endpoint, access_token: secret }, { status: 400, headers: { "x-private": secret } })), code);
  }
  await rejectsSafely("token", responseFetcher(Response.json({ error: "invalid_client", error_description: secret }, { status: 401 })), "oauth_client_credentials");
  await rejectsSafely("token", responseFetcher(Response.json({ error: secret, error_description: secret }, { status: 400 })), "oauth_token_rejected");
  await rejectsSafely("token", responseFetcher(Response.json({ error: "invalid_grant", error_description: secret })), "oauth_code_rejected");
});
test("valid token and account JSON stays server-side and is not reinterpreted as a diagnostic", async () => {
  const token = { access_token: secret, token_type: "bearer", refresh_token: secret, scope: "read:user" };
  assert.deepEqual(await requestOAuthProviderJson("token", endpoint, {}, responseFetcher(Response.json(token))), token);
  assert.deepEqual(await requestOAuthProviderJson("account", endpoint, {}, responseFetcher(Response.json({ account_id: "fixture-account" }))), { account_id: "fixture-account" });
  assert.equal(OAUTH_PROVIDER_RESPONSE_TIMEOUT_MS, 15_000);
});
test("account rejection, throttling and server failure remain distinct from token exchange", async () => {
  for (const stage of ["token", "account"] as const) {
    await rejectsSafely(stage, responseFetcher(new Response(secret, { status: 429, headers: { "retry-after": secret } })), `oauth_${stage}_rate_limited`);
    await rejectsSafely(stage, responseFetcher(Response.json({ error: "invalid_grant", error_description: secret }, { status: 503 })), `oauth_${stage}_unavailable`);
  }
  await rejectsSafely("account", responseFetcher(Response.json({ error: "invalid_client", error_description: secret }, { status: 401 })), "oauth_account_http_rejected");
  await rejectsSafely("token", responseFetcher(Response.json({ access_token: secret }, { status: 403 })), "oauth_token_http_rejected");
});
test("network and deadline failures are stage-specific and never forward exception text", async () => {
  for (const stage of ["token", "account"] as const) {
    let calls = 0;
    await rejectsSafely(stage, (async () => { calls++; throw new Error(secret); }) as typeof fetch, `oauth_${stage}_network`);
    assert.equal(calls, 1, "an authorization code must never be retried automatically");
    await rejectsSafely(stage, (async () => { throw new DOMException(secret, "TimeoutError"); }) as typeof fetch, `oauth_${stage}_timeout`);
    await rejectsSafely(stage, (async () => { throw new ConnectorError("oauth_client_credentials", secret); }) as typeof fetch, `oauth_${stage}_network`);
  }
});
test("malformed, absent and oversized responses are bounded and never reflected", async () => {
  for (const stage of ["token", "account"] as const) {
    for (const body of [secret, "[]", "null", '"'+secret+'"', ""]) await rejectsSafely(stage, responseFetcher(new Response(body)), `oauth_${stage}_response_invalid`);
    await rejectsSafely(stage, responseFetcher(new Response(null)), `oauth_${stage}_response_invalid`);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(OAUTH_PROVIDER_RESPONSE_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
    await rejectsSafely(stage, responseFetcher(new Response(stream)), `oauth_${stage}_response_invalid`);
    assert.equal(cancelled, true);
    const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(secret)); } });
    await rejectsSafely(stage, responseFetcher(new Response(broken)), `oauth_${stage}_network`);
  }
});
test("a stalled cancellation acknowledgement cannot hold an HTTP failure open", async () => {
  const stream = new ReadableStream<Uint8Array>({ cancel() { return new Promise<void>(() => {}); } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      rejectsSafely("account", responseFetcher(new Response(stream, { status: 503 })), "oauth_account_unavailable"),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("cleanup blocked the failure")), 250); }),
    ]);
  } finally { clearTimeout(timer); }
});
