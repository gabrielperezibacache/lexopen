import assert from "node:assert/strict";
import { test } from "node:test";
import { oauthFailureReason, readOAuthTokenResponse } from "./oauth-token-response";

const token = { access_token: "fictitious-read-only-token", token_type: "bearer", scope: "read:user" };
test("valid OAuth replies retain exactly the requested read scopes", () => {
  assert.deepEqual(readOAuthTokenResponse(token, ["read:user"]), { accessToken: token.access_token, scopes: ["read:user"] });
  assert.deepEqual(readOAuthTokenResponse({ ...token, scope: "files.read,account.read files.read" }, ["account.read", "files.read"]).scopes, ["account.read", "files.read"]);
  for (const scope of ["", "user", "read:user repo", undefined]) assert.throws(() => readOAuthTokenResponse({ ...token, scope }, ["read:user"]), error => (error as { code?: string }).code === "oauth_scope_mismatch");
});
test("provider credential, code and redirect failures are not mislabeled as missing scopes", () => {
  for (const [error, expected] of [["incorrect_client_credentials", "oauth_client_credentials"], ["invalid_client", "oauth_client_credentials"], ["bad_verification_code", "oauth_code_rejected"], ["invalid_grant", "oauth_code_rejected"], ["redirect_uri_mismatch", "oauth_callback_mismatch"], ["access_denied", "oauth_cancelled"], ["unknown-provider-response", "oauth_provider_rejected"]]) {
    assert.throws(() => readOAuthTokenResponse({ error, error_description: "fictitious-private-secret-must-stay-server-side", error_uri: "https://private.invalid/?secret=fictitious" }, ["read:user"]), cause => {
      const failure = cause as { code: string; message: string };
      assert.equal(failure.code, expected); assert.equal(failure.message.includes("fictitious"), false); assert.equal(failure.message.includes("private.invalid"), false); return true;
    });
  }
});
test("malformed access tokens fail before scope checks and recovery copy never reflects remote text", () => {
  for (const access_token of ["", "bad\r\ncredential", 42, undefined]) assert.throws(() => readOAuthTokenResponse({ ...token, access_token }, ["read:user"]), error => (error as { code?: string }).code === "oauth_token_invalid");
  assert.throws(() => readOAuthTokenResponse({ ...token, token_type: "Basic" }, ["read:user"]), error => (error as { code?: string }).code === "oauth_token_type");
  assert.equal(oauthFailureReason("arbitrary-fictitious-private-secret").includes("arbitrary"), false);
  assert.match(oauthFailureReason("oauth_client_credentials"), /Configuración/);
  assert.match(oauthFailureReason("oauth_code_rejected"), /Conectar/);
});
