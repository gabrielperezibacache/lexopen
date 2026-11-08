import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { assembleRelease } from "./assemble-release.mjs";
import { toolpackName, toolpackReceiptName } from "../altazor-toolpack.cjs";
import desktopProfile from "../altazor-desktop-profile.json" with { type: "json" };
const revision = "a".repeat(40);
const publicOAuth = { sha256: "c".repeat(64), providers: ["google", "github", "dropbox"] };
async function fixture(version = "1.1.0-preview.1") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-release-test-")), input = path.join(root, "input"), output = path.join(root, "release");
  const channel = version.includes("-") ? "preview" : "latest";
  for (const target of ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"]) {
    const dir = path.join(input, target); await fs.mkdir(dir, { recursive: true });
    const [platform, arch] = target.split("-"), osname = platform === "darwin" ? "mac" : platform === "win32" ? "win" : "linux";
    const assets = platform === "darwin" ? ["dmg", "zip"] : platform === "win32" ? ["exe", "zip"] : ["AppImage", "deb"], entries = [];
    for (const ext of assets) {
      const artifactArch = platform === "linux" ? ext === "deb" ? "amd64" : "x86_64" : arch;
      const name = `LexOpen-${version}-${osname}-${artifactArch}.${ext}`, bytes = Buffer.from(`Fictitious installer bytes: ${name}`);
      await fs.writeFile(path.join(dir, name), bytes);
      entries.push({ url: name, size: bytes.length, sha512: crypto.createHash("sha512").update(bytes).digest("base64") });
    }
    const base = { version, platform, arch }, buildId = `build-${target}`;
    await fs.writeFile(path.join(dir, `lexopen-packaged-${target}.json`), JSON.stringify({ ...base, sourceRevision: revision, sourceDirty: false, buildId, distributedOAuth: publicOAuth }));
    await fs.writeFile(path.join(dir, `lexopen-smoke-${target}.json`), JSON.stringify({ ...base, buildId, sourceRevision: revision, standaloneHealthy: true, bundledDocumentConversion: true, bundledChromiumLaunched: true, firstAdministratorCreated: true, restartPreservedDatabase: true, restartPreservedFiles: true, restartPreservedSecrets: true, externalNodeUsed: false, demoSeedUsed: false }));
    await fs.writeFile(path.join(dir, `lexopen-signature-${target}.json`), JSON.stringify({ ...base, publisherAuthenticated: false, notarized: false }));
    const feed = `${channel}${platform === "darwin" ? "-mac" : platform === "linux" ? "-linux" : ""}.yml`;
    await fs.writeFile(path.join(dir, feed), JSON.stringify({ version, files: entries }));
  }
  return { root, input, output, version, revision };
}
async function check(name, work, version) { const f = await fixture(version); try { await work(f); console.log(`PASS ${name}`); } finally { await fs.rm(f.root, { recursive: true, force: true }); } }
async function changeProfile(fixture, target, profile) {
  const file = path.join(fixture.input, target, `lexopen-packaged-${target}.json`), report = JSON.parse(await fs.readFile(file, "utf8"));
  if (profile === undefined) delete report.distributedOAuth; else report.distributedOAuth = profile;
  await fs.writeFile(file, JSON.stringify(report));
}
await check("four native targets assemble with both macOS architectures and exact checksums", async f => {
  const manifest = await assembleRelease(f); assert.equal(manifest.channel, "preview"); assert.equal(manifest.signatures.length, 4);
  assert.equal(manifest.publishable, true); assert.deepEqual(manifest.distributedOAuth, publicOAuth);
  const feed = JSON.parse(await fs.readFile(path.join(f.output, "preview-mac.yml"), "utf8"));
  assert.equal(feed.files.length, 4); assert(feed.files.some(a => a.url.endsWith("arm64.zip")));
  const sumLines = (await fs.readFile(path.join(f.output, "SHA256SUMS"), "utf8")).trim().split("\n");
  for (const line of sumLines) { const [hash, file] = line.split("  "); assert.equal(crypto.createHash("sha256").update(await fs.readFile(path.join(f.output, file))).digest("hex"), hash); }
  await assert.rejects(assembleRelease(f), /EEXIST/);
});
await check("publication requires all three identities even without desktop toolpacks", async f => {
  await changeProfile(f, "win32-x64", undefined);
  await assert.rejects(assembleRelease(f), /Missing public OAuth/);
  await assert.rejects(fs.stat(f.output), { code: "ENOENT" });
  await changeProfile(f, "win32-x64", { ...publicOAuth, providers: ["google", "github"] });
  await assert.rejects(assembleRelease(f), /publicación requiere/);
});
await check("all packaged targets must have the same public profile hash and providers", async f => {
  await changeProfile(f, "win32-x64", { ...publicOAuth, sha256: "d".repeat(64) });
  await assert.rejects(assembleRelease(f), /profiles differ across targets/);
  await changeProfile(f, "win32-x64", { ...publicOAuth, providers: [...publicOAuth.providers, "microsoft"] });
  await assert.rejects(assembleRelease(f), /profiles differ across targets/);
  await changeProfile(f, "win32-x64", { ...publicOAuth, sha256: "not-a-hash" });
  await assert.rejects(assembleRelease(f), /Invalid public OAuth/);
  await changeProfile(f, "win32-x64", { ...publicOAuth, providers: [...publicOAuth.providers, "dropbox"] });
  await assert.rejects(assembleRelease(f), /publicación requiere/);
});
await check("verification without public identities is explicitly not publishable", async f => {
  for (const target of ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"]) await changeProfile(f, target, undefined);
  await assert.rejects(assembleRelease(f), /Missing public OAuth/);
  const manifest = await assembleRelease({ ...f, verificationOnly: true });
  assert.equal(manifest.publishable, false); assert.equal(manifest.distributedOAuth, undefined);
  const saved = JSON.parse(await fs.readFile(path.join(f.output, "release-manifest.json"), "utf8"));
  assert.equal(saved.publishable, false);
});
await check("verification still rejects incomplete, missing-on-one-target or inconsistent profiles", async f => {
  for (const target of ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"]) await changeProfile(f, target, { ...publicOAuth, providers: ["google", "github"] });
  await assert.rejects(assembleRelease({ ...f, verificationOnly: true }), /publicación requiere/);
  for (const target of ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"]) await changeProfile(f, target, publicOAuth);
  await changeProfile(f, "darwin-x64", undefined);
  await assert.rejects(assembleRelease({ ...f, verificationOnly: true }), /profiles differ across targets/);
  await changeProfile(f, "darwin-x64", { ...publicOAuth, sha256: "d".repeat(64) });
  await assert.rejects(assembleRelease({ ...f, verificationOnly: true }), /profiles differ across targets/);
});
await check("verification with valid public identities remains not publishable", async f => {
  await assert.rejects(assembleRelease({ ...f, verificationOnly: "true" }), /Explicit verification-only/);
  await changeProfile(f, "win32-x64", { ...publicOAuth, providers: ["dropbox", "github", "google"] });
  const manifest = await assembleRelease({ ...f, verificationOnly: true });
  assert.equal(manifest.publishable, false); assert.deepEqual(manifest.distributedOAuth, publicOAuth);
});
await check("missing native target blocks publication", async f => { await fs.rm(path.join(f.input, "win32-x64"), { recursive: true }); await assert.rejects(assembleRelease(f), /Missing native/); });
await check("modified installer cannot pass its update checksum", async f => { await fs.appendFile(path.join(f.input, "darwin-arm64", `LexOpen-${f.version}-mac-arm64.zip`), "tamper"); await assert.rejects(assembleRelease(f), /checksum mismatch/); });
await check("stale source revision cannot be released", async f => { await assert.rejects(assembleRelease({ ...f, revision: "b".repeat(40) }), /Unverified source/); });
await check("feed cannot refer outside release artifacts", async f => {
  const file = path.join(f.input, "darwin-x64", "preview-mac.yml"), data = JSON.parse(await fs.readFile(file, "utf8")); data.files[0].url = "../private.zip"; await fs.writeFile(file, JSON.stringify(data)); await assert.rejects(assembleRelease(f), /Invalid update path/);
});
await check("unsigned preview cannot become stable", async f => { await assert.rejects(assembleRelease(f), /publisher authentication/); }, "1.1.0");
await check("unlisted files and symlinks fail closed", async f => {
  await fs.writeFile(path.join(f.input, "credentials.json"), "fixture"); await assert.rejects(assembleRelease(f), /Unexpected release input/);
  await fs.rm(path.join(f.input, "credentials.json")); await fs.symlink(path.join(f.input, "darwin-x64", `LexOpen-${f.version}-mac-x64.zip`), path.join(f.input, "alias")); await assert.rejects(assembleRelease(f), /Symlinks/);
});

async function addToolpack(fixture, architecture, changes = {}) {
  const directory = path.join(fixture.input, `altazor-toolpack-${architecture}`);
  await fs.mkdir(directory, { recursive: true });
  const name = toolpackName(fixture.version, architecture);
  const file = path.join(directory, name);
  const bytes = gzipSync(Buffer.from(`Fictitious Docker image ${architecture}`));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(file, bytes);
  await fs.writeFile(path.join(directory, toolpackReceiptName(architecture)), JSON.stringify({
    version: fixture.version, profile: desktopProfile.id, name, architecture, imageId: `sha256:${"f".repeat(64)}`,
    sourceCommit: desktopProfile.sourceCommit, sourceRevision: fixture.revision, size: bytes.length, sha256, ...changes,
  }));
  return { file, name, sha256 };
}

await check("tested desktop packages and receipts enter checksums but never installer feeds", async f => {
  const amd64 = await addToolpack(f, "amd64"), arm64 = await addToolpack(f, "arm64");
  const manifest = await assembleRelease({ ...f, withToolpacks: true, consumeInput: true });
  assert.equal(manifest.format, 1);
  assert.deepEqual(manifest.toolpacks.map(item => item.architecture), ["amd64", "arm64"]);
  const sums = await fs.readFile(path.join(f.output, "SHA256SUMS"), "utf8");
  for (const asset of [amd64, arm64]) {
    assert.equal(manifest.files.find(file => file.name === asset.name).sha256, asset.sha256);
    assert(sums.includes(`${asset.sha256}  ${asset.name}\n`));
    await assert.rejects(fs.stat(asset.file), { code: "ENOENT" });
  }
  for (const receipt of [toolpackReceiptName("amd64"), toolpackReceiptName("arm64")]) {
    assert(manifest.files.some(file => file.name === receipt));
    assert(sums.includes(`  ${receipt}\n`));
  }
  const macFeed = JSON.parse(await fs.readFile(path.join(f.output, "preview-mac.yml"), "utf8"));
  const linuxFeed = JSON.parse(await fs.readFile(path.join(f.output, "preview-linux.yml"), "utf8"));
  const winFeed = JSON.parse(await fs.readFile(path.join(f.output, "preview.yml"), "utf8"));
  assert([...macFeed.files, ...linuxFeed.files, ...winFeed.files].every(file => !file.url.includes("altazor")));
});

await check("toolpack publication requires both architectures from the exact revision and intact bytes", async f => {
  const amd64 = await addToolpack(f, "amd64");
  await assert.rejects(assembleRelease(f), /Unexpected release input/);
  await assert.rejects(assembleRelease({ ...f, withToolpacks: true }), /Missing desktop toolpack input/);
  await addToolpack(f, "arm64", { sourceRevision: "b".repeat(40) });
  await assert.rejects(assembleRelease({ ...f, withToolpacks: true }), /Unverified desktop toolpack: arm64/);
  await addToolpack(f, "arm64");
  await fs.appendFile(amd64.file, "tamper");
  await assert.rejects(assembleRelease({ ...f, withToolpacks: true }), /Unverified desktop toolpack: amd64/);
});

await check("desktop toolpack publication cannot bypass the public connection gate", async f => {
  await addToolpack(f, "amd64"); await addToolpack(f, "arm64");
  await changeProfile(f, "linux-x64", undefined);
  await assert.rejects(assembleRelease({ ...f, withToolpacks: true, consumeInput: true }), /Missing public OAuth/);
  await fs.stat(path.join(f.input, "win32-x64", `LexOpen-${f.version}-win-x64.exe`));
  await assert.rejects(fs.stat(f.output), { code: "ENOENT" });
});

await check("a desktop toolpack cannot be injected into the updater feed", async f => {
  const amd64 = await addToolpack(f, "amd64");
  await addToolpack(f, "arm64");
  const feed = path.join(f.input, "linux-x64", "preview-linux.yml"), data = JSON.parse(await fs.readFile(feed, "utf8"));
  data.files[0].url = amd64.name;
  await fs.writeFile(feed, JSON.stringify(data));
  await assert.rejects(assembleRelease({ ...f, withToolpacks: true }), /Invalid update path/);
});
