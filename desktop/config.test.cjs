const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  normalizeRemoteUrl,
  writeConfig,
  readConfig,
  ensureHostEnv,
  localAppUrl,
} = require("./config.cjs");

assert.equal(normalizeRemoteUrl("pc.tailnet.ts.net:3000"), "http://pc.tailnet.ts.net:3000");
assert.equal(
  normalizeRemoteUrl("https://pc.tailnet.ts.net/"),
  "https://pc.tailnet.ts.net"
);
assert.equal(localAppUrl(3000), "http://127.0.0.1:3000");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-desktop-"));
writeConfig({ mode: "client", remoteUrl: "http://host:3000", port: 3010 }, tmp);
const cfg = readConfig(tmp);
assert.equal(cfg.mode, "client");
assert.equal(cfg.remoteUrl, "http://host:3000");
assert.equal(cfg.port, 3010);

const host = ensureHostEnv(tmp, { port: 3010, pgPort: 54330, publicUrl: "http://pc.ts.net:3010" });
assert.match(host.databaseUrl, /54330/);
assert.equal(host.port, 3010);
const env = fs.readFileSync(host.envFile, "utf8");
assert.match(env, /LEXOPEN_DESKTOP=1/);
assert.match(env, /HOSTNAME=0\.0\.0\.0/);
assert.match(env, /LEXOPEN_TRUSTED_ORIGINS=/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("desktop/config.test.cjs OK");
