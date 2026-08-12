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
  mergeEnvPreserveUser,
  recognizeAppVersion,
  readAppState,
  envPath,
  storageDir,
  resolveBindHost,
  pgPasswordFromDatabaseUrl,
  isLegacyPgPassword,
  rewriteDatabaseUrlPassword,
  writeEnvKey,
  newPgPassword,
} = require("./config.cjs");

assert.equal(normalizeRemoteUrl("pc.tailnet.ts.net:3000"), "http://pc.tailnet.ts.net:3000");
assert.equal(
  normalizeRemoteUrl("https://pc.tailnet.ts.net/"),
  "https://pc.tailnet.ts.net"
);
assert.equal(localAppUrl(3000), "http://127.0.0.1:3000");
assert.equal(resolveBindHost("http://127.0.0.1:3000"), "127.0.0.1");
assert.equal(resolveBindHost("http://pc.ts.net:3000"), "0.0.0.0");
assert.equal(resolveBindHost("http://pc.ts.net:3000", "127.0.0.1"), "127.0.0.1");
assert.equal(
  pgPasswordFromDatabaseUrl("postgresql://lexopen:s3cret@127.0.0.1:54329/lexopen"),
  "s3cret"
);
assert.equal(isLegacyPgPassword("lexopen"), true);
assert.equal(isLegacyPgPassword(""), true);
assert.equal(isLegacyPgPassword("s3cret"), false);
const rotatedUrl = rewriteDatabaseUrlPassword(
  "postgresql://lexopen:lexopen@127.0.0.1:54329/lexopen",
  "n3w-pass"
);
assert.equal(pgPasswordFromDatabaseUrl(rotatedUrl), "n3w-pass");
assert.ok(newPgPassword().length >= 16);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-desktop-"));

// merge: no pisa secretos ni LLM del usuario
const merged = mergeEnvPreserveUser(
  [
    "SESSION_SECRET=keep-me",
    "LLM_API_KEY=sk-user",
    "CUSTOM_FLAG=1",
    "",
  ].join("\n"),
  {
    SESSION_SECRET: "new-secret",
    LLM_API_KEY: "sk-default",
    DATABASE_URL: "postgresql://lexopen:lexopen@127.0.0.1:54329/lexopen",
    STORAGE_PATH: "/data/storage",
  }
);
assert.match(merged.text, /SESSION_SECRET=keep-me/);
assert.match(merged.text, /LLM_API_KEY=sk-user/);
assert.match(merged.text, /CUSTOM_FLAG=1/);
assert.match(merged.text, /DATABASE_URL=/);
assert.match(merged.text, /STORAGE_PATH=\/data\/storage/);
assert.ok(!merged.added.includes("SESSION_SECRET"));

writeConfig({ mode: "client", remoteUrl: "http://host:3000", port: 3010 }, tmp);
const cfg = readConfig(tmp);
assert.equal(cfg.mode, "client");
assert.equal(cfg.remoteUrl, "http://host:3000");

const host = ensureHostEnv(tmp, {
  port: 3010,
  pgPort: 54330,
  publicUrl: "http://pc.ts.net:3010",
});
assert.match(host.databaseUrl, /54330/);
assert.equal(host.bindHost, "0.0.0.0");
assert.match(
  host.databaseUrl,
  /^postgresql:\/\/lexopen:[^:@/]+@127\.0\.0\.1:54330\/lexopen$/
);
assert.notEqual(pgPasswordFromDatabaseUrl(host.databaseUrl), "lexopen");
assert.equal(host.storagePath, storageDir(tmp));
const env1 = fs.readFileSync(envPath(tmp), "utf8");
const bootstrapToken = env1.match(/^LEXOPEN_BOOTSTRAP_TOKEN=(.+)$/m)[1];
assert.match(bootstrapToken, /^[a-f0-9]{64}$/);
const recoveryToken = env1.match(/^LEXOPEN_RECOVERY_TOKEN=(.+)$/m)[1];
assert.match(recoveryToken, /^[a-f0-9]{64}$/);
assert.match(env1, /HERMES_ALLOW_DEMO=0/);
assert.match(env1, /LLM_ALLOW_DEMO=0/);
assert.match(env1, /PJUD_ALLOW_DEMO=0/);
assert.match(env1, /LEXOPEN_DEMO_SWITCHER=0/);
assert.match(env1, /OBSIDIAN_ALLOW_PRIVATE_URL=1/);
const seeded = ensureHostEnv(
  fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-desktop-seed-")),
  { port: 3030, pgPort: 54332, publicUrl: "http://127.0.0.1:3030", seedDemo: true }
);
assert.match(
  fs.readFileSync(envPath(seeded.dataDir), "utf8"),
  /LEXOPEN_DEMO_SWITCHER=0/
);
assert.match(env1, /HOSTNAME=0\.0\.0\.0/);
assert.match(env1, /PJUD_SCRAPER_URL=http:\/\/127\.0\.0\.1:8787/);
assert.match(env1, /PJUD_SCRAPER_ALLOW_PRIVATE=1/);
assert.match(env1, /^CRON_SECRET=[a-f0-9]{48}$/m);
assert.match(env1, /^PJUD_SCRAPER_KEY=[a-f0-9]{48}$/m);

const loopbackHost = ensureHostEnv(
  fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-desktop-loop-")),
  { port: 3020, pgPort: 54331, publicUrl: "http://127.0.0.1:3020" }
);
assert.equal(loopbackHost.bindHost, "127.0.0.1");

// Upgrade: older Host .env with LLM_ALLOW_DEMO=1 becomes fail-closed 0
const demoUpgradeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-llm-demo-"));
fs.writeFileSync(
  envPath(demoUpgradeDir),
  "SESSION_SECRET=abcdefghijklmnopqrstuvwxyz12\nLLM_ALLOW_DEMO=1\n",
  "utf8"
);
ensureHostEnv(demoUpgradeDir, {
  port: 3040,
  pgPort: 54340,
  publicUrl: "http://127.0.0.1:3040",
});
assert.match(fs.readFileSync(envPath(demoUpgradeDir), "utf8"), /LLM_ALLOW_DEMO=0/);
const keepDemoDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-llm-keep-"));
fs.writeFileSync(
  envPath(keepDemoDir),
  "SESSION_SECRET=abcdefghijklmnopqrstuvwxyz12\nLLM_ALLOW_DEMO=1\nLEXOPEN_KEEP_LLM_DEMO=1\n",
  "utf8"
);
ensureHostEnv(keepDemoDir, {
  port: 3041,
  pgPort: 54341,
  publicUrl: "http://127.0.0.1:3041",
});
assert.match(fs.readFileSync(envPath(keepDemoDir), "utf8"), /LLM_ALLOW_DEMO=1/);

// segunda pasada: no reescribe SESSION_SECRET ni añade basura
const secret1 = env1.match(/^SESSION_SECRET=(.+)$/m)[1];
fs.appendFileSync(envPath(tmp), "LLM_API_KEY=sk-estudio\n");
ensureHostEnv(tmp, { port: 3010, pgPort: 54330, publicUrl: "http://pc.ts.net:3010" });
const env2 = fs.readFileSync(envPath(tmp), "utf8");
assert.match(env2, new RegExp(`SESSION_SECRET=${secret1}`));
assert.match(env2, new RegExp(`LEXOPEN_BOOTSTRAP_TOKEN=${bootstrapToken}`));
assert.match(env2, new RegExp(`LEXOPEN_RECOVERY_TOKEN=${recoveryToken}`));
assert.match(env2, /LLM_API_KEY=sk-estudio/);

const r1 = recognizeAppVersion("0.1.0", tmp);
assert.equal(r1.firstRun, true);
assert.equal(r1.changed, false);
const r2 = recognizeAppVersion("0.2.0", tmp);
assert.equal(r2.changed, true);
assert.equal(r2.previousVersion, "0.1.0");
assert.equal(readAppState(tmp).lastAppVersion, "0.2.0");
// reconocimiento inmediato: misma versión no “changed”
const r3 = recognizeAppVersion("0.2.0", tmp);
assert.equal(r3.changed, false);

// STORAGE_PATH bajo cwd/instalador se corrige a dataDir/storage
const {
  isUnsafeStoragePath,
  storageDir: storageDirFn,
} = require("./config.cjs");
assert.equal(isUnsafeStoragePath(path.join(process.cwd(), "storage"), tmp), true);
assert.equal(isUnsafeStoragePath(storageDirFn(tmp), tmp), false);
fs.writeFileSync(
  envPath(tmp),
  `SESSION_SECRET=${secret1}\nSTORAGE_PATH=${path.join(process.cwd(), "storage")}\n`,
  "utf8"
);
const fixedHost = ensureHostEnv(tmp, { port: 3010, pgPort: 54330 });
assert.equal(fixedHost.storagePath, storageDirFn(tmp));
assert.match(
  fs.readFileSync(envPath(tmp), "utf8"),
  new RegExp(storageDirFn(tmp).replace(/\\/g, "\\\\"))
);

const writeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-env-write-"));
fs.writeFileSync(envPath(writeTmp), "FOO=1\nDATABASE_URL=old\n", "utf8");
writeEnvKey(writeTmp, "DATABASE_URL", "postgresql://lexopen:x@127.0.0.1:1/lexopen");
assert.match(
  fs.readFileSync(envPath(writeTmp), "utf8"),
  /DATABASE_URL=postgresql:\/\/lexopen:x@127\.0\.0\.1:1\/lexopen/
);
assert.match(fs.readFileSync(envPath(writeTmp), "utf8"), /FOO=1/);
fs.rmSync(writeTmp, { recursive: true, force: true });

fs.rmSync(tmp, { recursive: true, force: true });
console.log("desktop/config.test.cjs OK");
