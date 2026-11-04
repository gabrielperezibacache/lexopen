import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { assembleRelease } from "./assemble-release.mjs";
const revision = "a".repeat(40);
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
    await fs.writeFile(path.join(dir, `lexopen-packaged-${target}.json`), JSON.stringify({ ...base, sourceRevision: revision, sourceDirty: false, buildId }));
    await fs.writeFile(path.join(dir, `lexopen-smoke-${target}.json`), JSON.stringify({ ...base, buildId, sourceRevision: revision, standaloneHealthy: true, bundledDocumentConversion: true, bundledChromiumLaunched: true, firstAdministratorCreated: true, restartPreservedDatabase: true, restartPreservedFiles: true, restartPreservedSecrets: true, externalNodeUsed: false, demoSeedUsed: false }));
    await fs.writeFile(path.join(dir, `lexopen-signature-${target}.json`), JSON.stringify({ ...base, publisherAuthenticated: false, notarized: false }));
    const feed = `${channel}${platform === "darwin" ? "-mac" : platform === "linux" ? "-linux" : ""}.yml`;
    await fs.writeFile(path.join(dir, feed), JSON.stringify({ version, files: entries }));
  }
  return { root, input, output, version, revision };
}
async function check(name, work, version) { const f = await fixture(version); try { await work(f); console.log(`PASS ${name}`); } finally { await fs.rm(f.root, { recursive: true, force: true }); } }
await check("four native targets assemble with both macOS architectures and exact checksums", async f => {
  const manifest = await assembleRelease(f); assert.equal(manifest.channel, "preview"); assert.equal(manifest.signatures.length, 4);
  const feed = JSON.parse(await fs.readFile(path.join(f.output, "preview-mac.yml"), "utf8"));
  assert.equal(feed.files.length, 4); assert(feed.files.some(a => a.url.endsWith("arm64.zip")));
  const sumLines = (await fs.readFile(path.join(f.output, "SHA256SUMS"), "utf8")).trim().split("\n");
  for (const line of sumLines) { const [hash, file] = line.split("  "); assert.equal(crypto.createHash("sha256").update(await fs.readFile(path.join(f.output, file))).digest("hex"), hash); }
  await assert.rejects(assembleRelease(f), /EEXIST/);
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
