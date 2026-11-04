import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const yaml = require("js-yaml");
const targets = ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"];
async function hashes(file) {
  const sha256 = crypto.createHash("sha256"), sha512 = crypto.createHash("sha512"); let size = 0;
  for await (const chunk of createReadStream(file)) { size += chunk.length; sha256.update(chunk); sha512.update(chunk); }
  return { size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") };
}
async function scan(dir, found = []) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isSymbolicLink()) throw new Error("Symlinks are forbidden in downloaded release inputs");
    if (item.isDirectory()) await scan(file, found);
    else if (item.isFile()) found.push(file);
    else throw new Error("Unsupported release input");
  }
  return found;
}
export async function assembleRelease({ input, output, version, revision }) {
  if (!/^\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(version) || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Exact release version and Git revision required");
  input = path.resolve(input); output = path.resolve(output);
  if (input === output || output.startsWith(input + path.sep) || input.startsWith(output + path.sep)) throw new Error("Release input and output must be separate");
  const channel = version.includes("-") ? "preview" : "latest", preview = channel === "preview";
  const files = await scan(input), byName = new Map(), feeds = [];
  // Native formats name the same CPU differently: Debian amd64, AppImage x86_64.
  const expectedAssets = ["mac-x64.dmg", "mac-x64.zip", "mac-arm64.dmg", "mac-arm64.zip", "win-x64.exe", "win-x64.zip", "linux-x86_64.AppImage", "linux-amd64.deb"].map(s => `LexOpen-${version}-${s}`);
  const feedNames = [`${channel}.yml`, `${channel}-mac.yml`, `${channel}-linux.yml`];
  const reportNames = targets.flatMap(t => ["packaged", "smoke", "signature"].map(k => `lexopen-${k}-${t}.json`));
  for (const file of files) {
    const name = path.basename(file);
    if (feedNames.includes(name)) { feeds.push({ name, file }); continue; }
    if (!expectedAssets.includes(name) && !expectedAssets.some(a => name === `${a}.blockmap`) && !reportNames.includes(name)) throw new Error(`Unexpected release input: ${name}`);
    if (byName.has(name)) throw new Error(`Duplicate release input: ${name}`);
    byName.set(name, file);
  }
  for (const name of [...expectedAssets, ...reportNames]) if (!byName.has(name)) throw new Error(`Missing native release input: ${name}`);
  const signatures = [];
  for (const target of targets) {
    const [platform, arch] = target.split("-");
    const read = async kind => JSON.parse(await fs.readFile(byName.get(`lexopen-${kind}-${target}.json`), "utf8"));
    const packaged = await read("packaged"), smoke = await read("smoke"), signature = await read("signature");
    for (const report of [packaged, smoke, signature]) if (report.version !== version || report.platform !== platform || report.arch !== arch) throw new Error(`Report identity mismatch: ${target}`);
    if (packaged.sourceRevision !== revision || smoke.sourceRevision !== revision || packaged.sourceDirty !== false || !packaged.buildId || packaged.buildId !== smoke.buildId) throw new Error(`Unverified source/build: ${target}`);
    for (const key of ["standaloneHealthy", "bundledDocumentConversion", "bundledChromiumLaunched", "firstAdministratorCreated", "restartPreservedDatabase", "restartPreservedFiles", "restartPreservedSecrets"]) if (smoke[key] !== true) throw new Error(`Incomplete Host smoke: ${target}/${key}`);
    if (smoke.externalNodeUsed !== false || smoke.demoSeedUsed !== false) throw new Error(`Non-self-contained Host smoke: ${target}`);
    if (!preview && platform !== "linux" && (signature.publisherAuthenticated !== true || platform === "darwin" && signature.notarized !== true)) throw new Error(`Stable release requires publisher authentication: ${target}`);
    signatures.push(signature);
  }
  const digests = new Map();
  for (const [name, file] of byName) digests.set(name, await hashes(file));
  const mergedFeeds = new Map();
  for (const { name, file } of feeds) {
    const info = yaml.load(await fs.readFile(file, "utf8"), { schema: yaml.JSON_SCHEMA });
    if (!info || info.version !== version || !Array.isArray(info.files) || !info.files.length) throw new Error(`Invalid update feed: ${name}`);
    const prefix = name.includes("-mac") ? "mac-" : name.includes("-linux") ? "linux-" : "win-";
    const entries = info.files.map(entry => {
      if (typeof entry.url !== "string" || path.basename(entry.url) !== entry.url || !expectedAssets.includes(entry.url) || !entry.url.startsWith(`LexOpen-${version}-${prefix}`)) throw new Error(`Invalid update path in ${name}`);
      const digest = digests.get(entry.url);
      if (entry.sha512 !== digest.sha512 || entry.size !== digest.size) throw new Error(`Update checksum mismatch: ${entry.url}`);
      return { url: entry.url, sha512: digest.sha512, size: digest.size, ...(Number.isSafeInteger(entry.blockMapSize) && entry.blockMapSize > 0 ? { blockMapSize: entry.blockMapSize } : {}) };
    });
    const existing = mergedFeeds.get(name) || [];
    for (const entry of entries) { if (existing.some(e => e.url === entry.url)) throw new Error(`Duplicate update asset: ${entry.url}`); existing.push(entry); }
    mergedFeeds.set(name, existing);
  }
  for (const name of feedNames) if (!mergedFeeds.has(name)) throw new Error(`Missing update feed: ${name}`);
  const mac = mergedFeeds.get(`${channel}-mac.yml`);
  for (const arch of ["x64", "arm64"]) if (!mac.some(e => e.url === `LexOpen-${version}-mac-${arch}.zip`)) throw new Error(`Missing macOS update architecture: ${arch}`);
  if (!mergedFeeds.get(`${channel}.yml`).some(e => e.url.endsWith(".exe")) || !mergedFeeds.get(`${channel}-linux.yml`).some(e => e.url.endsWith(".AppImage"))) throw new Error("Missing installable update target");
  await fs.mkdir(output); // Never overwrite or erase an existing destination.
  const manifest = { format: 1, version, channel, prerelease: preview, sourceRevision: revision, signatures, files: [] };
  for (const [name, file] of byName) { await fs.copyFile(file, path.join(output, name)); manifest.files.push({ name, ...digests.get(name) }); }
  for (const [name, entries] of mergedFeeds) {
    entries.sort((a, b) => a.url.localeCompare(b.url));
    const primary = entries.find(e => e.url.endsWith("-x64.zip")) || entries.find(e => e.url.endsWith(".exe") || e.url.endsWith(".AppImage")) || entries[0];
    await fs.writeFile(path.join(output, name), JSON.stringify({ version, files: entries, path: primary.url, sha512: primary.sha512, releaseDate: new Date().toISOString() }, null, 2) + "\n");
    manifest.files.push({ name, ...await hashes(path.join(output, name)) });
  }
  manifest.files.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(path.join(output, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const sums = [...manifest.files.map(f => `${f.sha256}  ${f.name}`), `${(await hashes(path.join(output, "release-manifest.json"))).sha256}  release-manifest.json`];
  await fs.writeFile(path.join(output, "SHA256SUMS"), sums.join("\n") + "\n");
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1];
  if (!["--input", "--output", "--version", "--revision"].every(k => args.includes(k))) throw new Error("Use --input --output --version --revision");
  const manifest = await assembleRelease({ input: option("--input"), output: option("--output"), version: option("--version"), revision: option("--revision") });
  console.log(JSON.stringify({ version: manifest.version, files: manifest.files.length, targets: targets.length, channel: manifest.channel }));
}
