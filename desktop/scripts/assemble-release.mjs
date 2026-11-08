import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const yaml = require("js-yaml");
const desktopProfile = require("./altazor-desktop-profile.json");
const { maximumArchiveBytes, toolpackName, toolpackReceiptName } = require("./altazor-toolpack.cjs");
const { requirePublishableOAuthProviders } = require("./oauth-clients.cjs");
const targets = ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"];
const toolpackArchitectures = ["amd64", "arm64"];
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
async function verifyToolpack({ architecture, archive, receipt, byName, digests, version, revision }) {
  const reportFile = byName.get(receipt), digest = digests.get(archive);
  const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
  if (report.version !== version || report.architecture !== architecture || report.name !== archive ||
    report.sourceRevision !== revision || report.sourceCommit !== desktopProfile.sourceCommit || report.profile !== desktopProfile.id ||
    typeof report.imageId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(report.imageId) ||
    report.size !== digest.size || report.sha256 !== digest.sha256) throw new Error(`Unverified desktop toolpack: ${architecture}`);
  const file = await fs.open(byName.get(archive), "r");
  try {
    const header = Buffer.alloc(3);
    if ((await file.read(header, 0, 3, 0)).bytesRead !== 3 || header.toString("hex") !== "1f8b08") {
      throw new Error(`Expected a gzip desktop toolpack: ${architecture}`);
    }
  } finally { await file.close(); }
  return { architecture, archive, receipt, imageId: report.imageId };
}

export async function assembleRelease({ input, output, version, revision, withToolpacks = false, consumeInput = false, verificationOnly = false }) {
  if (!/^\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(version) || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Exact release version and Git revision required");
  if (typeof verificationOnly !== "boolean") throw new Error("Explicit verification-only mode required");
  input = path.resolve(input); output = path.resolve(output);
  if (input === output || output.startsWith(input + path.sep) || input.startsWith(output + path.sep)) throw new Error("Release input and output must be separate");
  const channel = version.includes("-") ? "preview" : "latest", preview = channel === "preview";
  const files = await scan(input), byName = new Map(), feeds = [];
  // Native formats name the same CPU differently: Debian amd64, AppImage x86_64.
  const expectedAssets = ["mac-x64.dmg", "mac-x64.zip", "mac-arm64.dmg", "mac-arm64.zip", "win-x64.exe", "win-x64.zip", "linux-x86_64.AppImage", "linux-amd64.deb"].map(s => `LexOpen-${version}-${s}`);
  const toolpacks = withToolpacks ? toolpackArchitectures.map(architecture => ({ architecture, archive: toolpackName(version, architecture), receipt: toolpackReceiptName(architecture) })) : [];
  const expectedToolpacks = toolpacks.flatMap(({ archive, receipt }) => [archive, receipt]);
  const feedNames = [`${channel}.yml`, `${channel}-mac.yml`, `${channel}-linux.yml`];
  const reportNames = targets.flatMap(t => ["packaged", "smoke", "signature"].map(k => `lexopen-${k}-${t}.json`));
  for (const file of files) {
    const name = path.basename(file);
    if (feedNames.includes(name)) { feeds.push({ name, file }); continue; }
    if (!expectedAssets.includes(name) && !expectedAssets.some(a => name === `${a}.blockmap`) && !reportNames.includes(name) && !expectedToolpacks.includes(name)) throw new Error(`Unexpected release input: ${name}`);
    if (byName.has(name)) throw new Error(`Duplicate release input: ${name}`);
    byName.set(name, file);
  }
  for (const name of [...expectedAssets, ...reportNames]) if (!byName.has(name)) throw new Error(`Missing native release input: ${name}`);
  for (const name of expectedToolpacks) if (!byName.has(name)) throw new Error(`Missing desktop toolpack input: ${name}`);
  for (const { architecture, archive, receipt } of toolpacks) {
    const { size } = await fs.stat(byName.get(archive));
    if (size < 3 || size > maximumArchiveBytes) throw new Error(`Invalid desktop toolpack size: ${archive}`);
    if ((await fs.stat(byName.get(receipt))).size > 16 * 1024) throw new Error(`Oversized desktop toolpack receipt: ${architecture}`);
  }
  const signatures = [];
  let distributedOAuth;
  for (const target of targets) {
    const [platform, arch] = target.split("-");
    const read = async kind => JSON.parse(await fs.readFile(byName.get(`lexopen-${kind}-${target}.json`), "utf8"));
    const packaged = await read("packaged"), smoke = await read("smoke"), signature = await read("signature");
    for (const report of [packaged, smoke, signature]) if (report.version !== version || report.platform !== platform || report.arch !== arch) throw new Error(`Report identity mismatch: ${target}`);
    if (packaged.sourceRevision !== revision || smoke.sourceRevision !== revision || packaged.sourceDirty !== false || !packaged.buildId || packaged.buildId !== smoke.buildId) throw new Error(`Unverified source/build: ${target}`);
    const profile = packaged.distributedOAuth;
    let verifiedProfile = null;
    if (profile !== undefined) {
      if (!profile || typeof profile.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(profile.sha256)) throw new Error(`Invalid public OAuth release profile: ${target}`);
      verifiedProfile = { sha256: profile.sha256, providers: requirePublishableOAuthProviders(profile.providers) };
    } else if (!verificationOnly) throw new Error(`Missing public OAuth release profile: ${target}`);
    if (distributedOAuth === undefined) distributedOAuth = verifiedProfile;
    else if (JSON.stringify(distributedOAuth) !== JSON.stringify(verifiedProfile)) throw new Error(`Public OAuth release profiles differ across targets: ${target}`);
    for (const key of ["standaloneHealthy", "bundledDocumentConversion", "bundledChromiumLaunched", "firstAdministratorCreated", "restartPreservedDatabase", "restartPreservedFiles", "restartPreservedSecrets"]) if (smoke[key] !== true) throw new Error(`Incomplete Host smoke: ${target}/${key}`);
    if (smoke.externalNodeUsed !== false || smoke.demoSeedUsed !== false) throw new Error(`Non-self-contained Host smoke: ${target}`);
    if (!preview && platform !== "linux" && (signature.publisherAuthenticated !== true || platform === "darwin" && signature.notarized !== true)) throw new Error(`Stable release requires publisher authentication: ${target}`);
    signatures.push(signature);
  }
  const digests = new Map();
  for (const [name, file] of byName) digests.set(name, await hashes(file));
  const verifiedToolpacks = [];
  for (const toolpack of toolpacks) verifiedToolpacks.push(await verifyToolpack({ ...toolpack, byName, digests, version, revision }));
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
  const manifest = { format: 1, version, channel, prerelease: preview, publishable: !verificationOnly, sourceRevision: revision, signatures, files: [], ...(distributedOAuth ? { distributedOAuth } : {}), ...(withToolpacks ? { toolpacks: verifiedToolpacks } : {}) };
  for (const [name, file] of byName) {
    const destination = path.join(output, name);
    // Release CI owns the downloaded copies and can move them after verification to avoid doubling disk usage.
    if (consumeInput) await fs.rename(file, destination);
    else await fs.copyFile(file, destination);
    manifest.files.push({ name, ...digests.get(name) });
  }
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
  if (!["--input", "--output", "--version", "--revision"].every(k => args.includes(k))) throw new Error("Use --input --output --version --revision [--with-toolpacks] [--consume-input] [--verification-only]");
  const manifest = await assembleRelease({ input: option("--input"), output: option("--output"), version: option("--version"), revision: option("--revision"), withToolpacks: args.includes("--with-toolpacks"), consumeInput: args.includes("--consume-input"), verificationOnly: args.includes("--verification-only") });
  console.log(JSON.stringify({ version: manifest.version, files: manifest.files.length, targets: targets.length, channel: manifest.channel, publishable: manifest.publishable }));
}
