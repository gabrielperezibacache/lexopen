const assert = require("node:assert/strict");
const { isAllowedAppUrl, isAllowedExternalUrl } = require("./external-url.cjs");

assert.equal(
  isAllowedExternalUrl("https://evil.com", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);
assert.equal(
  isAllowedExternalUrl("http://127.0.0.1:3000/setup", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("https://pc.ts.net:3010/login", {
    appUrls: ["https://pc.ts.net:3010"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("https://github.com/gabrielperezibacache/lexopen", {
    appUrls: ["http://127.0.0.1:3000"],
    extraHosts: ["github.com"],
  }),
  true
);
assert.equal(
  isAllowedExternalUrl("javascript:alert(1)", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);
assert.equal(
  isAllowedExternalUrl("https://user:pass@127.0.0.1:3000/", {
    appUrls: ["http://127.0.0.1:3000"],
  }),
  false
);

assert.equal(isAllowedExternalUrl("https://www.linkedin.com/oauth/v2/authorization?client_id=fixture"), true);
assert.equal(isAllowedExternalUrl("https://www.linkedin.com/feed/"), true);
assert.equal(isAllowedExternalUrl("http://www.linkedin.com/feed/"), false);
assert.equal(isAllowedExternalUrl("https://www.linkedin.com:444/feed/"), false);
assert.equal(isAllowedExternalUrl("https://www.linkedin.com.evil.test/"), false);
assert.equal(isAllowedExternalUrl("https://evil.linkedin.com/"), false);

const options = { appUrls: ["http://127.0.0.1:3000"], extraHosts: ["github.com", "www.github.com", "render.com", "docs.render.com"] };
function authorization(host = "accounts.google.com", pathname = "/o/oauth2/v2/auth", changes = {}) {
  const url = new URL(`https://${host}${pathname}`);
  url.search = new URLSearchParams({ client_id: "fixture-public-client", response_type: "code", redirect_uri: "http://127.0.0.1:3000/api/altazor/connectors/oauth/callback", state: "s".repeat(43), code_challenge: "c".repeat(43), code_challenge_method: "S256", scope: "files.metadata.read", ...changes });
  return url.href;
}
const microsoft = authorization("login.microsoftonline.com", "/common/oauth2/v2.0/authorize", { scope: "offline_access User.Read Files.Read", response_mode: "query", redirect_uri: "http://localhost:3000/api/altazor/connectors/oauth/callback" });
const authorizations = [authorization(), authorization("www.dropbox.com", "/oauth2/authorize", { token_access_type: "offline" }), authorization("github.com", "/login/oauth/authorize"), microsoft];
for (const url of authorizations) {
  assert.equal(isAllowedExternalUrl(url, options), true, url);
  assert.equal(isAllowedAppUrl(url, options.appUrls), false, "authorization never becomes app navigation");
  for (const replacement of ["http:", "javascript:"]) assert.equal(isAllowedExternalUrl(url.replace("https:", replacement), options), false);
  for (const key of ["user", "username", "pass", "password", "token", "access_token", "refresh_token", "id_token", "client_secret", "code_verifier", "redirect", "redirect_url", "return_to", "next", "continue", "url", "redirectUrl"]) {
    assert.equal(isAllowedExternalUrl(`${url}&${key}=malicious-fixture`, options), false, key);
  }
  for (const suffix of ["#access_token=fixture", "#anything", "&state=second-state", "&%73tate=second-state"]) assert.equal(isAllowedExternalUrl(url + suffix, options), false, suffix);
  assert.equal(isAllowedExternalUrl(url.replace("https://", "https://user:pass@"), options), false);
  assert.equal(isAllowedExternalUrl(url.replace("https://", "https://fixture@"), options), false);
  assert.equal(isAllowedExternalUrl(url.replace("/oauth", "/other/oauth"), options), false);
}
for (const redirect_uri of ["https://evil.test/api/altazor/connectors/oauth/callback", "http://127.0.0.1:9999/api/altazor/connectors/oauth/callback", "http://127.0.0.1.evil.test:3000/api/altazor/connectors/oauth/callback", "http://192.168.1.2:3000/api/altazor/connectors/oauth/callback", "http://127.0.0.1:3000/api/altazor/connectors/oauth/callback?next=https://evil.test", "http://127.0.0.1:3000/api/altazor/connectors/oauth/callback#token=fixture", "http://127.0.0.1:3000/api/altazor/connectors/oauth/callback/", "http://127.0.0.1:3000/api/altazor/connectors/oauth/../redirect", "http://fixture@127.0.0.1:3000/api/altazor/connectors/oauth/callback"]) {
  assert.equal(isAllowedExternalUrl(authorization(undefined, undefined, { redirect_uri }), options), false, redirect_uri);
}
for (const host of ["localhost", "[::1]"]) {
  assert.equal(isAllowedExternalUrl(authorization(undefined, undefined, { redirect_uri: `http://${host}:3000/api/altazor/connectors/oauth/callback` }), options), true);
}
assert.equal(isAllowedExternalUrl(authorization(undefined, undefined, { redirect_uri: "http://localhost:3366/api/altazor/connectors/oauth/callback" }), { appUrls: ["http://localhost:3366"] }), true);
for (const changes of [{ response_type: "token" }, { state: "" }, { state: "s".repeat(42) }, { code_challenge: "" }, { code_challenge_method: "plain" }]) assert.equal(isAllowedExternalUrl(authorization(undefined, undefined, changes), options), false);
for (const url of ["https://accounts.google.com/", "https://www.dropbox.com/redirect?url=https://evil.test", "https://evil.accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com.evil.test/o/oauth2/v2/auth", "https://www.dropbox.com.evil.test/oauth2/authorize", "https://github.com/login/device?token=fixture", "https://github.com/login/device#token=fixture", "https://www.github.com/login/device", "https://github.com/login/oauth/access_token", "https://github.com/login/other", "https://github.com/redirect?url=https://evil.test", "https://github.com/#access_token=fixture", "https://github.com/#javascript%3Aalert(1)", "https://github.com/#%ZZ", "https://github.com/?%63lient_secret=fixture", "http://github.com/login/device", "https://github.com:444/login/device", "javascript:alert(1)", "file:///tmp/fixture", "https://git\nhub.com/login/device"]) assert.equal(isAllowedExternalUrl(url, options), false, url);
for (const url of ["https://github.com/login/device", "https://github.com/gabrielperezibacache/lexopen/releases", "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ALTAZOR-CONEXIONES.md#inicio-de-sesi%C3%B3n-sencillo", "https://docs.render.com/deploy-hooks#creating-a-deploy-hook", "https://www.linkedin.com/feed/"]) assert.equal(isAllowedExternalUrl(url, options), true, url);
assert.equal(isAllowedExternalUrl("https://evil.github.com/login/device", options), false);
assert.equal(isAllowedExternalUrl("https://github.com/%6cogin/device", options), false);
assert.equal(isAllowedExternalUrl("https://github.com/login%2fdevice", options), false);
for (const changed of [microsoft.replace("/common/", "/organizations/"), microsoft.replace("/authorize?", "/token?"), microsoft.replace("login.microsoftonline.com", "evil.login.microsoftonline.com"), microsoft.replace("login.microsoftonline.com", "login.microsoftonline.com.evil.test"), microsoft.replace("response_mode=query", "response_mode=fragment"), microsoft.replace("Files.Read", "Files.ReadWrite.All"), microsoft.replace("localhost%3A3000", "127.0.0.1%3A3000")]) assert.equal(isAllowedExternalUrl(changed, options), false, changed);
assert.equal(isAllowedAppUrl("http://[::1]:3000/setup"), true);
assert.equal(isAllowedAppUrl("https://www.linkedin.com/feed/", options.appUrls), false);
assert.equal(isAllowedExternalUrl("https://www.linkedin.com/oauth/v2/authorization?client_id=fixture&redirect_uri=https%3A%2F%2Fpc.ts.net%2Fapi%2Fpersonal-connectors%2Flinkedin%2Foauth%2Fcallback", { appUrls: ["https://pc.ts.net"] }), true);
console.log("desktop/external-url.test.cjs OK — official OAuth paths, PKCE/state, app loopback callbacks and external handoffs");
