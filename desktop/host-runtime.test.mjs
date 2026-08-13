import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyHostFailClosedEnv,
  ensureHostToolPath,
  extraHostToolPathDirs,
  ensureStandaloneStaticAssets,
  ensureStandalonePlaywright,
  repoNodePath,
  loadEnvFile,
  preferEnvFileKeys,
  setupPendingMessage,
  validateHostPorts,
} from "./host-runtime.mjs";

assert.doesNotThrow(() => validateHostPorts(3000, 54329));
assert.throws(() => validateHostPorts(3000, 3000), /debe ser distinto/);
assert.throws(() => validateHostPorts(80, 54329), /Puerto inválido/);
assert.throws(() => validateHostPorts(3000, 70000), /Puerto inválido/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-loadenv-"));
const envFile = path.join(tmp, ".env");
fs.writeFileSync(
  envFile,
  "LLM_ALLOW_DEMO=1\nFROM_FILE=yes\nALREADY=file-value\n",
  "utf8"
);
const env = { ALREADY: "parent-wins" };
loadEnvFile(envFile, env);
assert.equal(env.ALREADY, "parent-wins");
assert.equal(env.FROM_FILE, "yes");
assert.equal(env.LLM_ALLOW_DEMO, "1");

// Parent/CI shell pollution must not survive into production Host Next.
const polluted = {
  LEXOPEN_RELAX_CSRF: "1",
  LEXOPEN_OPEN_ACCESS: "1",
  LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS: "1",
  HERMES_ALLOW_DEMO: "1",
  LLM_ALLOW_DEMO: "1",
  PJUD_ALLOW_DEMO: "1",
  LEXOPEN_DEMO_SWITCHER: "1",
};
applyHostFailClosedEnv(polluted);
assert.equal(polluted.LEXOPEN_RELAX_CSRF, "0");
assert.equal(polluted.LEXOPEN_OPEN_ACCESS, "0");
assert.equal(polluted.LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS, "0");
assert.equal(polluted.HERMES_ALLOW_DEMO, "0");
assert.equal(polluted.LLM_ALLOW_DEMO, "0");
assert.equal(polluted.PJUD_ALLOW_DEMO, "0");
assert.equal(polluted.LEXOPEN_DEMO_SWITCHER, "0");

const keepDemos = {
  HERMES_ALLOW_DEMO: "1",
  LEXOPEN_KEEP_HERMES_DEMO: "1",
  LEXOPEN_RELAX_CSRF: "1",
};
applyHostFailClosedEnv(keepDemos);
assert.equal(keepDemos.HERMES_ALLOW_DEMO, "1");
assert.equal(keepDemos.LEXOPEN_RELAX_CSRF, "0");

// Shell DATABASE_URL (e.g. CI e2e) must not win over the Host data-dir .env.
const identityFile = path.join(tmp, "identity.env");
fs.writeFileSync(
  identityFile,
  "DATABASE_URL=postgresql://lexopen:host@127.0.0.1:54329/lexopen\nSESSION_SECRET=host-secret-value-ok\nPORT=3011\n",
  "utf8"
);
const identityEnv = {
  DATABASE_URL: "postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e",
  SESSION_SECRET: "shell-secret",
  PORT: "3000",
};
preferEnvFileKeys(identityFile, undefined, identityEnv);
assert.equal(
  identityEnv.DATABASE_URL,
  "postgresql://lexopen:host@127.0.0.1:54329/lexopen"
);
assert.equal(identityEnv.SESSION_SECRET, "host-secret-value-ok");
assert.equal(identityEnv.PORT, "3011");

const electronMsg = setupPendingMessage({ isElectron: true, port: 3000 });
assert.match(electronMsg, /Desktop/);
assert.doesNotMatch(electronMsg, /[a-f0-9]{32}/);
const webMsg = setupPendingMessage({ isElectron: false, port: 3010 });
assert.match(webMsg, /127\.0\.0\.1:3010\/setup/);
assert.match(webMsg, /LEXOPEN_BOOTSTRAP_TOKEN/);
assert.doesNotMatch(webMsg, /token=[a-f0-9]/);

const missingStatic = path.join(tmp, "server.js");
fs.writeFileSync(missingStatic, "", "utf8");
assert.throws(
  () => ensureStandaloneStaticAssets(missingStatic, tmp),
  /desktop:build/
);

const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-standalone-"));
const standaloneDir = path.join(cloneRoot, ".next", "standalone");
fs.mkdirSync(standaloneDir, { recursive: true });
const cloneEntry = path.join(standaloneDir, "server.js");
fs.writeFileSync(cloneEntry, "", "utf8");
const srcStatic = path.join(cloneRoot, ".next", "static");
fs.mkdirSync(srcStatic, { recursive: true });
fs.writeFileSync(path.join(srcStatic, "app.css"), "body{color:navy}");
const srcPublic = path.join(cloneRoot, "public");
fs.mkdirSync(srcPublic, { recursive: true });
fs.writeFileSync(path.join(srcPublic, "favicon.ico"), "ico");

const destStatic = ensureStandaloneStaticAssets(cloneEntry, cloneRoot);
assert.equal(destStatic, path.join(standaloneDir, ".next", "static"));
assert.equal(
  fs.readFileSync(path.join(destStatic, "app.css"), "utf8"),
  "body{color:navy}"
);
assert.equal(
  fs.readFileSync(path.join(standaloneDir, "public", "favicon.ico"), "utf8"),
  "ico"
);

const pwSrc = path.join(cloneRoot, "node_modules", "playwright");
const pwCoreSrc = path.join(cloneRoot, "node_modules", "playwright-core");
fs.mkdirSync(path.join(pwSrc, "lib"), { recursive: true });
fs.mkdirSync(pwCoreSrc, { recursive: true });
fs.writeFileSync(path.join(pwSrc, "index.js"), "module.exports = { chromium: true };");
fs.writeFileSync(path.join(pwSrc, "package.json"), '{"name":"playwright","version":"1.0.0"}');
fs.writeFileSync(path.join(pwCoreSrc, "index.js"), "module.exports = {};");
fs.writeFileSync(
  path.join(pwCoreSrc, "package.json"),
  '{"name":"playwright-core","version":"1.0.0"}'
);
assert.equal(ensureStandalonePlaywright(cloneEntry, cloneRoot), 2);
assert.equal(
  fs.readFileSync(
    path.join(standaloneDir, "node_modules", "playwright", "index.js"),
    "utf8"
  ),
  "module.exports = { chromium: true };"
);
assert.ok(
  fs.existsSync(path.join(standaloneDir, "node_modules", "playwright-core", "index.js"))
);
const nodePath = repoNodePath(cloneRoot, "");
assert.equal(nodePath, path.join(cloneRoot, "node_modules"));
assert.match(repoNodePath(cloneRoot, "/tmp/other"), /node_modules/);

assert.ok(extraHostToolPathDirs("darwin").includes("/opt/homebrew/bin"));
const slimPath = { PATH: "/usr/bin:/bin" };
ensureHostToolPath(slimPath, "linux");
assert.equal(slimPath.PATH, "/usr/bin:/bin");
const macPath = { PATH: "/usr/bin:/bin" };
ensureHostToolPath(macPath, "darwin");
assert.match(macPath.PATH, /\/usr\/bin/);

console.log("desktop/host-runtime.test.mjs OK");
