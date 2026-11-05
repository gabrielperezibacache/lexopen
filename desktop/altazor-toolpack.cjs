const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createWriteStream } = require("node:fs");
const { lstat, mkdtemp, open, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { promisify } = require("node:util");
const { desktopCliEnvironment, desktopProfilePresent, localDesktopEngine } = require("./altazor-desktop-profile.cjs");

const runFile = promisify(execFile);
const repository = "gabrielperezibacache/lexopen";
const maximumArchiveBytes = 2_000_000_000;
const maximumMetadataBytes = 256 * 1024;
const validVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z.-]+)?$/i;
const supportedArchitectures = new Set(["amd64", "arm64"]);

function toolpackName(version, architecture) {
  if (typeof version !== "string" || version.length > 80 || !validVersion.test(version) || !supportedArchitectures.has(architecture)) return null;
  return `LexOpen-${version}-altazor-linux-${architecture}.tar.gz`;
}

function toolpackReceiptName(architecture) {
  return supportedArchitectures.has(architecture) ? `lexopen-altazor-toolpack-linux-${architecture}.json` : null;
}

function selectOfficialToolpack(release, version, architecture) {
  const name = toolpackName(version, architecture);
  if (!name || !release || release.tag_name !== `v${version}` || release.draft !== false || !Array.isArray(release.assets)) return null;
  const matches = release.assets.filter(asset => asset?.name === name);
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const url = `https://github.com/${repository}/releases/download/v${version}/${name}`;
  if (asset.state !== "uploaded" || asset.browser_download_url !== url ||
    !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maximumArchiveBytes ||
    typeof asset.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) return null;
  return { name, size: asset.size, sha256: asset.digest.slice(7) };
}

async function readRelease(response) {
  if (!response.body || Number(response.headers.get("content-length")) > maximumMetadataBytes) throw new Error("Release metadata size");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumMetadataBytes) throw new Error("Release metadata size");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

function dockerOptions(env, timeout) {
  return { env: desktopCliEnvironment(env), timeout, maxBuffer: 64 * 1024, windowsHide: true, shell: false };
}

async function lookupDesktopToolpack(version, { execute = runFile, fetcher = fetch, env = process.env } = {}) {
  const engine = await localDesktopEngine({ execute, env });
  if (engine.state !== "engine-ready") return { state: engine.state };
  try {
    const reply = await execute(engine.binary, ["--host", engine.host, "version", "--format", "{{.Server.Arch}}"], dockerOptions(env, 3000));
    const architecture = reply.stdout.trim();
    if (!toolpackName(version, architecture)) return { state: "package-unavailable" };
    const response = await fetcher(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "LexOpen-Desktop" },
      signal: AbortSignal.timeout(8000), redirect: "error", credentials: "omit",
    });
    if (response.status === 404) return { state: "package-unavailable" };
    if (!response.ok) return { state: "package-check-failed" };
    const asset = selectOfficialToolpack(await readRelease(response), version, architecture);
    return asset ? { state: "package-verified", asset, engine, architecture } : { state: "package-unavailable" };
  } catch { return { state: "package-check-failed" }; }
}

async function copyVerifiedArchive(source, destination, asset) {
  const selected = await lstat(source);
  if (!selected.isFile() || selected.size !== asset.size) return false;
  const handle = await open(source, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== selected.dev || opened.ino !== selected.ino || opened.size !== asset.size) return false;
    const hash = createHash("sha256");
    let size = 0;
    const measure = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > asset.size) return callback(new Error("Selected archive size changed"));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(handle.createReadStream({ autoClose: false }), measure, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    return size === asset.size && hash.digest("hex") === asset.sha256;
  } finally { await handle.close(); }
}

async function loadVerifiedDesktopToolpack(file, verified, { execute = runFile, env = process.env } = {}) {
  if (verified?.state !== "package-verified") return { state: "package-unavailable" };
  const { asset, engine, architecture } = verified;
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maximumArchiveBytes || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
    return { state: "package-unavailable" };
  }
  const directory = await mkdtemp(path.join(tmpdir(), "lexopen-desktop-tools-"));
  try {
    const staged = path.join(directory, "official-package.tar.gz");
    try {
      if (!await copyVerifiedArchive(file, staged, asset)) return { state: "package-mismatch" };
    } catch { return { state: "package-read-failed" }; }
    try {
      await execute(engine.binary, ["--host", engine.host, "image", "load", "--input", staged], dockerOptions(env, 10 * 60_000));
      const checked = await desktopProfilePresent(engine, { execute, env, architecture });
      return { state: checked ? "package-loaded" : "package-load-unconfirmed" };
    } catch { return { state: "package-load-unconfirmed" }; }
  } finally { await rm(directory, { recursive: true, force: true }); }
}

module.exports = { maximumArchiveBytes, toolpackName, toolpackReceiptName, selectOfficialToolpack, lookupDesktopToolpack, loadVerifiedDesktopToolpack };
