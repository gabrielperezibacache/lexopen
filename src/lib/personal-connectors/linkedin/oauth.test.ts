import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { accountContext, actualScopes, digest, seal, unseal } from "../core";
import { linkedInConfig } from "./config";
import { authorizationUrl, exchangeLinkedInCode, validateIdToken, type Fetcher } from "./oauth";
import { publicationSnapshot, sendLinkedInPost } from "./transport";

const keyMaterial = "72bac891cfd530bfca99804ee4d03ac17dbcc06627182479";
const config = linkedInConfig({ LINKEDIN_CLIENT_ID: "client-fixture", LINKEDIN_CLIENT_SECRET: "secret-fixture", LINKEDIN_REDIRECT_URI: "https://host.example.test/api/personal-connectors/linkedin/oauth/callback", LINKEDIN_SHARE_ENABLED: "1", SESSION_SECRET: keyMaterial });
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256", use: "sig" };
function jwt(change: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const parts = [{ alg: "RS256", kid: "fixture", ...header }, { iss: "https://www.linkedin.com", aud: "client-fixture", sub: "member-fixture", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, nonce: "nonce-fixture", ...change }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url"));
  return `${parts.join(".")}.${sign("RSA-SHA256", Buffer.from(parts.join(".")), pair.privateKey).toString("base64url")}`;
}
function stub(bodyFor: (url: string, init?: RequestInit) => unknown): Fetcher {
  return (async (url, init) => new Response(JSON.stringify(bodyFor(String(url), init)), { status: 200, headers: { "Content-Type": "application/json" } })) as Fetcher;
}
test("personal credential ciphertext is bound to owner and fails closed", () => {
  const context = accountContext("owner-a", "account-a"), encrypted = seal({ accessToken: "token-fixture" }, context, keyMaterial);
  assert.ok(!encrypted.includes("token-fixture"));
  assert.deepEqual(unseal(encrypted, context, keyMaterial), { accessToken: "token-fixture" });
  assert.throws(() => unseal(encrypted, accountContext("owner-b", "account-a"), keyMaterial));
  assert.throws(() => unseal("plaintext-token", context, keyMaterial));
  assert.throws(() => seal({ a: 1 }, context, ""));
});
test("configuration and permissions never infer a connection or grant", () => {
  assert.equal(linkedInConfig({}).configured, false);
  assert.equal(config.configured, true);
  assert.equal(linkedInConfig({ LINKEDIN_CLIENT_ID: "fixture", LINKEDIN_CLIENT_SECRET: "fixture", LINKEDIN_REDIRECT_URI: "http://127.0.0.1/api/personal-connectors/linkedin/oauth/callback", SESSION_SECRET: keyMaterial }).configured, false);
  assert.equal(actualScopes(undefined), null);
  assert.deepEqual(actualScopes("profile,openid w_member_social"), ["openid", "profile", "w_member_social"]);
  const url = new URL(authorizationUrl(config, "state-fixture", "nonce-fixture", false).url);
  assert.equal(url.searchParams.get("scope"), "openid profile");
  assert.equal(url.searchParams.get("nonce"), "nonce-fixture");
  assert.equal(url.searchParams.has("client_secret"), false);
});
test("OIDC verifies signature, issuer, audience, expiry, nonce and algorithm", async () => {
  const fetcher = stub(url => { assert.equal(url, "https://www.linkedin.com/oauth/openid/jwks"); return { keys: [jwk] }; });
  assert.equal(await validateIdToken(jwt(), "client-fixture", digest("nonce-fixture"), fetcher), "member-fixture");
  for (const claims of [{ iss: "https://attacker.test" }, { aud: "other-client" }, { exp: 1 }, { nonce: "other-nonce" }, { sub: "member:invalid" }, { aud: ["client-fixture", "other"], azp: "other" }, { azp: "other-client" }, { nbf: "invalid-date" }, { aud: ["client-fixture", 3] }]) await assert.rejects(validateIdToken(jwt(claims), "client-fixture", digest("nonce-fixture"), fetcher));
  await assert.rejects(validateIdToken(jwt({}, { alg: "none" }), "client-fixture", digest("nonce-fixture"), fetcher));
  const token = jwt(); await assert.rejects(validateIdToken(token.slice(0, -6) + "aaaaaa", "client-fixture", digest("nonce-fixture"), fetcher));
});
test("OAuth exchanges only against official endpoints and records actual scopes", async () => {
  const calls: string[] = [];
  const fetcher = stub((url, init) => {
    calls.push(url);
    if (url.endsWith("accessToken")) { assert.ok(String(init?.body).includes("redirect_uri=")); return { access_token: "token-fixture", id_token: jwt(), expires_in: 3600, scope: "openid profile" }; }
    if (url.endsWith("jwks")) return { keys: [jwk] };
    if (url.endsWith("userinfo")) return { sub: "member-fixture", name: "Profesional ficticio" };
    throw new Error("Unexpected network endpoint");
  });
  const result = await exchangeLinkedInCode(config, "code-fixture", digest("nonce-fixture"), fetcher);
  assert.deepEqual(result.scopes, ["openid", "profile"]); assert.equal(result.email, null); assert.equal(result.refreshToken, undefined);
  assert.equal(calls.length, 3);
  const wrongProfile = stub(url => url.endsWith("accessToken") ? { access_token: "token-fixture", id_token: jwt(), expires_in: 3600 } : url.endsWith("jwks") ? { keys: [jwk] } : { sub: "other-member", name: "Otra persona ficticia" });
  await assert.rejects(exchangeLinkedInCode(config, "code-fixture", digest("nonce-fixture"), wrongProfile));
});
test("approval hashes bind revision, exact text, audience and author", () => {
  const draft = { id: "draft-fixture", revision: 1, body: "Lectura académica ficticia", sourceUrl: "https://example.test/paper", visibility: "CONNECTIONS" };
  const first = publicationSnapshot(draft, "account-a", "person-a").hash;
  for (const changed of [{ ...draft, revision: 2 }, { ...draft, body: "Otro texto" }, { ...draft, visibility: "PUBLIC" }]) assert.notEqual(publicationSnapshot(changed, "account-a", "person-a").hash, first);
  assert.notEqual(publicationSnapshot(draft, "account-a", "person-b").hash, first);
  assert.notEqual(publicationSnapshot({ ...draft, originJson: '{"kind":"academic"}' }, "account-a", "person-a").hash, first);
});
test("publication transport makes one request and keeps ambiguous outcomes unknown", async () => {
  const input = { token: "token-fixture", subject: "member-fixture", commentary: "Texto ficticio", visibility: "CONNECTIONS" };
  let calls = 0;
  const accepted = (async (_url, init) => { calls++; const body = JSON.parse(String(init?.body)); assert.equal(body.author, "urn:li:person:member-fixture"); assert.equal(body.visibility, "CONNECTIONS"); return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:12345" } }); }) as Fetcher;
  assert.equal((await sendLinkedInPost(input, accepted)).status, "published"); assert.equal(calls, 1);
  const timeout = (async () => { calls++; throw new Error("fixture transport interrupted"); }) as Fetcher;
  assert.equal((await sendLinkedInPost(input, timeout)).status, "unknown"); assert.equal(calls, 2);
  assert.equal((await sendLinkedInPost(input, (async () => new Response(null, { status: 500 })) as Fetcher)).status, "unknown");
  assert.equal((await sendLinkedInPost(input, (async () => new Response(null, { status: 201 })) as Fetcher)).status, "unknown");
  assert.equal((await sendLinkedInPost(input, (async () => new Response(null, { status: 403 })) as Fetcher)).status, "failed");
});
