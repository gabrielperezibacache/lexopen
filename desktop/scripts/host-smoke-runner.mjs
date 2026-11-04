/** Runs only against a newly-created, marked temporary data directory. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const option = name => process.argv[process.argv.indexOf(name) + 1];
const dataDir = path.resolve(option("--data"));
const resources = path.resolve(option("--resources"));
const marker = JSON.parse(await fs.readFile(path.join(dataDir, ".lexopen-smoke-owned"), "utf8"));
assert.equal(marker.nonce, option("--nonce"));
assert(path.basename(dataDir).startsWith("lexopen-desktop-smoke-"));
const tmpRoot = await fs.realpath(os.tmpdir());
const realData = await fs.realpath(dataDir);
const relative = path.relative(tmpRoot, realData);
assert(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
assert(!(await fs.lstat(dataDir)).isSymbolicLink());
const port = Number(option("--port")), pgPort = Number(option("--pg-port"));
assert(Number.isInteger(port) && Number.isInteger(pgPort) && port !== pgPort && port >= 1024 && pgPort >= 1024);
assert.equal(process.env.LEXOPEN_DATA_DIR, dataDir);
assert.equal(process.env.LEXOPEN_APP_ROOT, path.join(resources, "app-standalone"));
assert.equal(process.env.LEXOPEN_PRISMA_ROOT, path.join(resources, "prisma"));
const runtimeFile = path.join(resources, "app.asar.unpacked", "host-runtime.mjs");
const { startHost } = await import(pathToFileURL(runtimeFile).href);
const envValues = async () => Object.fromEntries((await fs.readFile(path.join(dataDir, ".env"), "utf8")).split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
let active;
let stopPromise = Promise.resolve();
let interrupted = false;
const stop = () => { const handle = active; active = null; if (handle) stopPromise = stopPromise.then(() => handle.stop()); return stopPromise; };
process.once("SIGTERM", () => { interrupted = true; void stop().finally(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { interrupted = true; void stop().finally(() => { process.exitCode = 1; }); });
const start = async () => {
  const handle = await startHost({ dataDir, port, pgPort, publicUrl: "", seedDemo: false });
  if (interrupted) { await handle.stop(); throw new Error("Smoke interrupted"); }
  return handle;
};
try {
  active = await start();
  assert(active.needsSetup, "A clean package must require its first real administrator");
  const health = await fetch(`${active.url}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.version, active.version);
  assert.equal(health.buildId, active.buildId);
  assert.equal(health.sourceRevision, active.sourceRevision);
  assert.match(health.sourceRevision, /^[a-f0-9]{40}$/);
  assert.equal(health.needsSetup, true);
  const requireBundled = createRequire(path.join(resources, "app-standalone", "package.json"));
  const { toMarkdownBytes, formatFromExtension } = requireBundled("@firecrawl/anydoc");
  const extracted = await toMarkdownBytes(Buffer.from("nombre,detalle\nLexOpen,instalación ficticia\n", "utf8"), formatFromExtension(".csv"));
  assert.match(extracted, /LexOpen/);
  const browser = await requireBundled("playwright").chromium.launch({ headless: true, timeout: 30000 });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.setContent("<!doctype html><title>LexOpen packaged browser</title><h1>Fictitious installation check</h1>");
    assert.equal(await page.title(), "LexOpen packaged browser");
  } finally { await browser.close(); }
  const page = await fetch(`${active.url}/setup`);
  assert.equal(page.status, 200);
  const cookies = page.headers.getSetCookie?.() || [page.headers.get("set-cookie") || ""];
  const csrf = cookies.join(";").match(/(?:^|[;,]\s*)lexopen_csrf=([^;]+)/)?.[1];
  const password = `Fixture-${crypto.randomBytes(20).toString("hex")}`;
  const setup = await fetch(`${active.url}/api/setup`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: active.url, ...(csrf ? { Cookie: `lexopen_csrf=${csrf}`, "x-csrf-token": csrf } : {}) },
    body: JSON.stringify({ token: active.bootstrapToken, name: "Administrador de prueba", email: "installer-fixture@example.test", password }),
  });
  assert.equal(setup.status, 201, "The packaged application must create its first administrator");
  const setupState = await fetch(`${active.url}/api/setup`).then(response => response.json());
  assert.equal(setupState.needsSetup, false);
  const values = await envValues();
  const secretHashes = Object.fromEntries(["DATABASE_URL", "SESSION_SECRET", "STORAGE_PATH"].map(key => { assert(values[key]); return [key, digest(values[key])]; }));
  const sentinel = path.join(dataDir, "storage", "fixture de instalación & revisión.txt");
  await fs.writeFile(sentinel, "LexOpen installer persistence fixture — información ficticia\n", { mode: 0o600 });
  const sentinelHash = digest(await fs.readFile(sentinel));
  await stop();
  active = await start();
  assert.equal(active.needsSetup, false);
  const again = await fetch(`${active.url}/api/health`).then(response => response.json());
  assert.equal(again.ok, true); assert.equal(again.version, health.version); assert.equal(again.buildId, health.buildId);
  assert.equal(again.sourceRevision, health.sourceRevision);
  assert.equal(digest(await fs.readFile(sentinel)), sentinelHash);
  const nextValues = await envValues();
  for (const [key, hash] of Object.entries(secretHashes)) assert.equal(digest(nextValues[key]), hash, `${key} must survive restart`);
  await stop();
  console.log(`LEXOPEN_DESKTOP_SMOKE ${JSON.stringify({ platform: process.platform, arch: process.arch, version: health.version, buildId: health.buildId, sourceRevision: health.sourceRevision, standaloneHealthy: true, bundledDocumentConversion: true, bundledChromiumLaunched: true, firstAdministratorCreated: true, restartPreservedDatabase: true, restartPreservedFiles: true, restartPreservedSecrets: true, externalNodeUsed: false, demoSeedUsed: false })}`);
} finally { await stop(); }
