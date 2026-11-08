const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseDistributedOAuthProfile: parse, applyDistributedOAuthProfile: apply, DISTRIBUTED_OAUTH_ENV: key } = require("./oauth-clients.cjs");

const fixture = { schemaVersion: 1, google: { type: "installed", client_id: "123456789-fixture.apps.googleusercontent.com", client_secret: "fixture-installed-public-parameter" }, github: { type: "device", client_id: "fixturePublicClient123" } };
assert.deepEqual(parse(JSON.stringify(fixture)), fixture);
assert.equal(Object.isFrozen(parse(fixture).google), true);
const publicCloud = { schemaVersion: 1, dropbox: { type: "public_client", client_id: "fixtureDropboxApp123" }, microsoft: { type: "public_client", client_id: "12345678-abcd-1234-abcd-123456789abc" } };
assert.deepEqual(parse(JSON.stringify(publicCloud)), publicCloud);
for (const bad of [
  {}, { schemaVersion: 1 }, { ...fixture, schemaVersion: 2 }, { ...fixture, endpoint: "https://fixture.invalid" },
  { schemaVersion: 1, google: { ...fixture.google, type: "web" } },
  { schemaVersion: 1, google: { ...fixture.google, client_secret: "" } },
  { schemaVersion: 1, google: { ...fixture.google, access_token: "never-show-private-value" } },
  { schemaVersion: 1, google: { ...fixture.google, client_secret: "ya29.never-show-private-value" } },
  { schemaVersion: 1, github: { type: "device", client_id: "github_pat_never-show-private-value" } },
  { schemaVersion: 1, github: { ...fixture.github, client_secret: "never-show-private-value" } },
  { schemaVersion: 1, github: { ...fixture.github, client_id: "https://fixture.invalid" } },
  { ...publicCloud, microsoft: { ...publicCloud.microsoft, client_secret: "never-show-private-value" } },
  { ...publicCloud, microsoft: { ...publicCloud.microsoft, client_id: "not-a-client-guid" } },
  { ...publicCloud, dropbox: { ...publicCloud.dropbox, type: "web" } },
  { ...publicCloud, dropbox: { ...publicCloud.dropbox, access_token: "never-show-private-value" } },
  { ...publicCloud, dropbox: { ...publicCloud.dropbox, client_secret: "" } },
  Object.assign(Object.create({ inherited: true }), fixture),
  JSON.parse('{"schemaVersion":1,"__proto__":{},"github":{"type":"device","client_id":"fixture-public"}}'),
  " ".repeat(16385), "not-json",
]) {
  assert.throws(() => parse(bad), error => error.message === "El perfil público de conexiones no es válido." && !error.message.includes("never-show-private-value"));
}
const accessor = { schemaVersion: 1 };
Object.defineProperty(accessor, "google", { enumerable: true, get() { throw new Error("Accessor must not run"); } });
assert.throws(() => parse(accessor), /perfil público/);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-public-oauth-"));
try {
  const file = path.join(directory, "oauth-clients.json");
  fs.writeFileSync(file, JSON.stringify(fixture));
  const environment = { ALTAZOR_GOOGLE_CLIENT_SECRET: "preserve-private-operator-secret" };
  assert.deepEqual(apply(file, environment), fixture);
  assert.deepEqual(JSON.parse(environment[key]), fixture);
  assert.equal(environment.ALTAZOR_GOOGLE_CLIENT_SECRET, "preserve-private-operator-secret");
  const existing = { [key]: JSON.stringify({ schemaVersion: 1, github: fixture.github }) };
  assert.deepEqual(apply(path.join(directory, "missing.json"), existing), { schemaVersion: 1, github: fixture.github });
  const invalidExisting = { [key]: "private-invalid-config" };
  assert.throws(() => apply(file, invalidExisting), /perfil público/);
  assert.equal(invalidExisting[key], "private-invalid-config");
  assert.equal(apply(path.join(directory, "missing.json"), {}), null);
  fs.writeFileSync(file, JSON.stringify({ web: { client_secret: "never-show-private-value" } }));
  const unchanged = {};
  assert.throws(() => apply(file, unchanged), /perfil público/);
  assert.deepEqual(unchanged, {});
  fs.writeFileSync(file, " ".repeat(16385));
  assert.throws(() => apply(file, {}), /perfil público/);
  if (process.platform !== "win32") {
    const link = path.join(directory, "linked.json"); fs.symlinkSync(file, link);
    assert.throws(() => apply(link, {}), /perfil público/);
  }
} finally { fs.rmSync(directory, { recursive: true }); }
console.log("Public OAuth profile: strict installed/device contract, safe diagnostics, bounded files and configuration precedence passed.");
