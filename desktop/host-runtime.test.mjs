import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyHostFailClosedEnv,
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

console.log("desktop/host-runtime.test.mjs OK");
