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
const envValues = async (directory = dataDir) => Object.fromEntries((await fs.readFile(path.join(directory, ".env"), "utf8")).split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
let active;
let stopPromise = Promise.resolve();
let interrupted = false;
let phase = "start-host";
let recoveryRoot = null;
const stop = () => { const handle = active; active = null; if (handle) stopPromise = stopPromise.then(() => handle.stop()); return stopPromise; };
process.once("SIGTERM", () => { interrupted = true; void stop().finally(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { interrupted = true; void stop().finally(() => { process.exitCode = 1; }); });
const start = async (directory = dataDir) => {
  const handle = await startHost({ dataDir: directory, port, pgPort, publicUrl: "", seedDemo: false });
  if (interrupted) { await handle.stop(); throw new Error("Smoke interrupted"); }
  return handle;
};
async function treeDigest(root) {
  const checksum = crypto.createHash("sha256");
  async function visit(directory) {
    for (const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=path.join(directory,entry.name);assert(!entry.isSymbolicLink());
      checksum.update(path.relative(root,file));checksum.update("\0");
      if(entry.isDirectory())await visit(file);else checksum.update(await fs.readFile(file));
    }
  }
  await visit(root);return checksum.digest("hex");
}
async function authenticate(url,password) {
  const loginPage=await fetch(`${url}/login`), initial=loginPage.headers.getSetCookie();
  const csrf=initial.join(";").match(/(?:^|[;,]\s*)lexopen_csrf=([^;]+)/)?.[1];assert(csrf);
  const response=await fetch(`${url}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",Origin:url,Cookie:`lexopen_csrf=${csrf}`,"x-csrf-token":csrf},body:JSON.stringify({email:"installer-fixture@example.test",password})});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.needsTotp,undefined);assert.equal(body.user.email,"installer-fixture@example.test");
  const cookies=new Map([...initial,...response.headers.getSetCookie()].map(line=>{const pair=line.split(";",1)[0],at=pair.indexOf("=");return[pair.slice(0,at),pair.slice(at+1)];}));
  return {Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join("; "),Origin:url,"x-csrf-token":cookies.get("lexopen_csrf")};
}
try {
  active = await start();
  phase = "initial-health";
  assert(active.needsSetup, "A clean package must require its first real administrator");
  const health = await fetch(`${active.url}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.version, active.version);
  assert.equal(health.buildId, active.buildId);
  assert.equal(health.sourceRevision, active.sourceRevision);
  assert.match(health.sourceRevision, /^[a-f0-9]{40}$/);
  assert.equal(health.needsSetup, true);
  const requireBundled = createRequire(path.join(resources, "app-standalone", "package.json"));
  phase = "document-conversion";
  const { toMarkdownBytes, formatFromExtension } = requireBundled("@firecrawl/anydoc");
  const extracted = await toMarkdownBytes(Buffer.from("nombre,detalle\nLexOpen,instalación ficticia\n", "utf8"), formatFromExtension(".csv"));
  assert.match(extracted, /LexOpen/);
  const { chromium } = requireBundled("playwright");
  phase = "full-chromium";
  // Exercise the full browser used by manual OJV sessions, including its macOS
  // frameworks, rather than Playwright's separate headless-shell download.
  const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true, timeout: 30000 });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.setContent("<!doctype html><title>LexOpen packaged browser</title><h1>Fictitious installation check</h1>");
    assert.equal(await page.title(), "LexOpen packaged browser");
  } finally { await browser.close(); }
  phase = "first-administrator";
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
  phase = "fictitious-document-and-settings";
  const credentials=await authenticate(active.url,password);
  const documentBytes=Buffer.from("Fictitious legal document for native backup restoration. Información sintética.\n","utf8");
  const form=new FormData();form.set("nombre","Restore fixture.txt");form.set("tipo","otro");form.set("file",new Blob([documentBytes],{type:"text/plain"}),"restore-fixture.txt");
  const created=await fetch(`${active.url}/api/documentos`,{method:"POST",headers:credentials,body:form});assert.equal(created.status,201);const document=await created.json();assert(document.id);assert(document.storageKey);
  const {PrismaClient}=requireBundled("@prisma/client");
  const sourceClient=new PrismaClient({datasources:{db:{url:values.DATABASE_URL}}});
  let organizationId;
  try {
    const organization=await sourceClient.organization.findFirst()||await sourceClient.organization.create({data:{name:"Fictitious restore firm"}});organizationId=organization.id;
    await sourceClient.firmSettings.upsert({where:{organizationId},create:{organizationId,emisorRazonSocial:"Fictitious restore firm"},update:{emisorRazonSocial:"Fictitious restore firm"}});
  }finally{await sourceClient.$disconnect();}
  const sentinel = path.join(dataDir, "storage", "fixture de instalación & revisión.txt");
  await fs.writeFile(sentinel, "LexOpen installer persistence fixture — información ficticia\n", { mode: 0o600 });
  const sentinelHash = digest(await fs.readFile(sentinel));
  phase = "first-shutdown";
  await stop();
  phase = "restart-host";
  active = await start();
  phase = "verify-persistence";
  assert.equal(active.needsSetup, false);
  const again = await fetch(`${active.url}/api/health`).then(response => response.json());
  assert.equal(again.ok, true); assert.equal(again.version, health.version); assert.equal(again.buildId, health.buildId);
  assert.equal(again.sourceRevision, health.sourceRevision);
  assert.equal(digest(await fs.readFile(sentinel)), sentinelHash);
  const nextValues = await envValues();
  for (const [key, hash] of Object.entries(secretHashes)) assert.equal(digest(nextValues[key]), hash, `${key} must survive restart`);
  phase = "backup-stopped-host"; await stop();
  assert(!await fs.access(path.join(dataDir,"pgdata","postmaster.pid")).then(()=>true,()=>false));
  const sourceDigest=await treeDigest(dataDir);
  recoveryRoot=await fs.mkdtemp(path.join(os.tmpdir(),"lexopen-desktop-restore-"));
  await fs.writeFile(path.join(recoveryRoot,".lexopen-smoke-owned"),JSON.stringify({nonce:marker.nonce}),{mode:0o600});
  const requireDesktop=createRequire(path.join(resources,"app.asar.unpacked","package.json"));
  const {createDataBackup,restoreDataDirectory,finalizeRestore}=requireDesktop("./backup.cjs");
  const {parseEnvFile,serializeEnv}=requireDesktop("./config.cjs");
  const backup=path.join(recoveryRoot,"backup"),destination=path.join(recoveryRoot,"restored");
  await createDataBackup(dataDir,backup,{appVersion:health.version});
  phase="restore-failure-rollback";
  const badBackup=path.join(recoveryRoot,"bad-backup"),oldTarget=path.join(recoveryRoot,"failed-target");
  await fs.mkdir(path.join(badBackup,"pgdata"),{recursive:true});await fs.mkdir(path.join(badBackup,"storage"));await fs.mkdir(oldTarget);
  await fs.writeFile(path.join(oldTarget,"keep.txt"),"prior destination");
  await fs.copyFile(path.join(backup,"manifest.json"),path.join(badBackup,"manifest.json"));await fs.copyFile(path.join(backup,"pgdata","PG_VERSION"),path.join(badBackup,"pgdata","PG_VERSION"));
  const badEnv=parseEnvFile(await fs.readFile(path.join(backup,".env"),"utf8"));badEnv.map.STORAGE_PATH=path.join(recoveryRoot,"not-the-source");
  await fs.writeFile(path.join(badBackup,".env"),serializeEnv(badEnv.map,badEnv.order),{mode:0o600});
  await assert.rejects(restoreDataDirectory(oldTarget,badBackup,{relocateManagedHost:true}));assert.equal(await fs.readFile(path.join(oldTarget,"keep.txt"),"utf8"),"prior destination");
  phase="restore-empty-directory";
  const replacement=await restoreDataDirectory(destination,backup,{relocateManagedHost:true});
  phase="start-restored-host";
  process.env.CODEX_DATA_DIR=path.join(destination,"disabled-codex");process.env.CODEX_BIN=path.join(destination,"not-installed");
  active=await start(destination);assert.equal(active.needsSetup,false);
  const restoredCredentials=await authenticate(active.url,password);
  const downloaded=await fetch(`${active.url}/api/documentos/${encodeURIComponent(document.id)}/content`,{headers:restoredCredentials});assert.equal(downloaded.status,200);assert(Buffer.from(await downloaded.arrayBuffer()).equals(documentBytes));
  const restoredValues=await envValues(destination);
  assert.equal(digest(restoredValues.SESSION_SECRET),secretHashes.SESSION_SECRET);
  assert.equal(path.resolve(restoredValues.STORAGE_PATH),path.join(destination,"storage"));
  const restoredClient=new PrismaClient({datasources:{db:{url:restoredValues.DATABASE_URL}}});
  try {
    const [directory]=await restoredClient.$queryRaw`SELECT current_setting('data_directory') AS directory`;
    assert.equal(await fs.realpath(directory.directory),await fs.realpath(path.join(destination,"pgdata")));
    assert.equal((await restoredClient.firmSettings.findUniqueOrThrow({where:{organizationId}})).emisorRazonSocial,"Fictitious restore firm");
  }finally{await restoredClient.$disconnect();}
  phase="stop-restored-host";await stop();await finalizeRestore(replacement.rollback);
  phase="verify-original-intact";assert.equal(await treeDigest(dataDir),sourceDigest);

  console.log(`LEXOPEN_DESKTOP_SMOKE ${JSON.stringify({ platform: process.platform, arch: process.arch, version: health.version, buildId: health.buildId, sourceRevision: health.sourceRevision, standaloneHealthy: true, bundledDocumentConversion: true, bundledChromiumLaunched: true, firstAdministratorCreated: true, restartPreservedDatabase: true, restartPreservedFiles: true, restartPreservedSecrets: true, backupRestoredDatabase: true, backupRestoredFiles: true, backupRestoredSettings: true, backupSourcePreserved: true, backupRollbackVerified: true, externalNodeUsed: false, demoSeedUsed: false })}`);
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : "UNCLASSIFIED";
  // Report fixed phase and bounded error code only, never raw server logs/tokens.
  console.error(`LEXOPEN_DESKTOP_SMOKE_FAILURE ${JSON.stringify({ phase, code })}`);
  throw new Error(`Packaged Host probe failed during ${phase} (${code})`);
} finally {
  await stop();
  if(recoveryRoot){
    assert.equal(JSON.parse(await fs.readFile(path.join(recoveryRoot,".lexopen-smoke-owned"),"utf8")).nonce,marker.nonce);
    assert(!await fs.access(path.join(recoveryRoot,"restored","pgdata","postmaster.pid")).then(()=>true,()=>false));
    await fs.rm(recoveryRoot,{recursive:true,force:true});
  }
}
