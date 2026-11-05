const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createWriteStream } = require("node:fs");
const { lstat, mkdir, mkdtemp, open, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { promisify } = require("node:util");
const { desktopCliEnvironment, desktopProfilePresent, dockerDesktopRoot, localDesktopEngine } = require("./altazor-desktop-profile.cjs");
const profile = require("./altazor-desktop-profile.json");

const runFile = promisify(execFile);
const repository = "gabrielperezibacache/lexopen";
const maximumArchiveBytes = 2_000_000_000;
const maximumSourceBytes = 20 * 1024 * 1024;
const maximumMetadataBytes = 256 * 1024;
const validVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z.-]+)?$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;
const supportedArchitectures = new Set(["amd64", "arm64"]);
const releaseHosts = new Set(["release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
const requestHeaders = { "User-Agent": "LexOpen-Desktop" };

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
    typeof asset.digest !== "string" || !asset.digest.startsWith("sha256:") || !sha256Pattern.test(asset.digest.slice(7))) return null;
  return { name, url, size: asset.size, sha256: asset.digest.slice(7) };
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

function dockerOptions(env, timeout, signal) {
  return { env: desktopCliEnvironment(env), timeout, killSignal: "SIGKILL", maxBuffer: 256 * 1024, windowsHide: true, shell: false, signal };
}

function preparationDeadline(timeout, signal) {
  const deadline = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

async function lookupDesktopToolpack(version, architecture, fetcher, signal) {
  if (!toolpackName(version, architecture)) return { state: "package-unavailable" };
  try {
    const response = await fetcher(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
      headers: { ...requestHeaders, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: preparationDeadline(8000, signal), redirect: "error", credentials: "omit",
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return { state: "package-unavailable" };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { state: "package-check-failed" };
    }
    const asset = selectOfficialToolpack(await readRelease(response), version, architecture);
    return asset ? { state: "package-verified", asset } : { state: "package-unavailable" };
  } catch { return { state: "package-check-failed" }; }
}

async function fetchArchive(asset, fetcher, signal) {
  let url = new URL(asset.url);
  for (let count = 0; count <= 3; count++) {
    const response = await fetcher(url.href, {
      headers: { ...requestHeaders, Accept: "application/octet-stream", "Accept-Encoding": "identity" },
      signal, redirect: "manual", credentials: "omit",
    });
    if (response.status === 200) return response;
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) throw new Error("Toolpack download failed");
    url = new URL(location, url);
    if (url.protocol !== "https:" || !releaseHosts.has(url.hostname) || url.port || url.username || url.password || url.hash) {
      throw new Error("Unexpected toolpack download host");
    }
  }
  throw new Error("Too many toolpack redirects");
}

async function downloadArchive(asset, destination, fetcher, progress, preparationSignal) {
  const signal = preparationDeadline(20 * 60_000, preparationSignal);
  const response = await fetchArchive(asset, fetcher, signal);
  const size = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding");
  if (!response.body || (size !== null && (!/^\d+$/.test(size) || Number(size) !== asset.size)) || (encoding && encoding !== "identity")) {
    await response.body?.cancel();
    return false;
  }
  const hash = createHash("sha256");
  let bytes = 0, reported = 0, exceeded = false;
  const measure = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > asset.size) {
        exceeded = true;
        return callback(new Error("Toolpack exceeds its official size"));
      }
      hash.update(chunk);
      const percent = Math.floor(bytes / asset.size * 20) * 5;
      if (percent > reported) {
        reported = percent;
        progress({ state: "package-downloading", percent });
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), measure, createWriteStream(destination, { flags: "wx", mode: 0o600 }), { signal });
  } catch (error) {
    if (exceeded) return false;
    throw error;
  }
  return bytes === asset.size && hash.digest("hex") === asset.sha256;
}

async function readBundledFile(file, maximum) {
  const entry = await lstat(file);
  if (!entry.isFile() || entry.size <= 0 || entry.size > maximum) throw new Error("Unexpected desktop resource");
  const handle = await open(file, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino || opened.size !== entry.size) throw new Error("Desktop resource changed");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ end: entry.size, autoClose: false })) {
      bytes += chunk.length;
      chunks.push(chunk);
    }
    if (bytes !== entry.size) throw new Error("Desktop resource changed");
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}

function buildFromContext(binary, args, options, context) {
  const result = runFile(binary, args, options);
  const input = result.child.stdin;
  input?.on("error", () => {}); // A failed Docker build can close stdin early.
  input?.end(context);
  return result;
}

async function prepareSource(resourceRoot, directory, engine, architecture, { execute, build, env, progress, signal }) {
  if (!resourceRoot) return { state: "package-unavailable" };
  const source = path.join(resourceRoot, "altazor-desktop-source");
  let context;
  try {
    const manifest = JSON.parse(await readBundledFile(path.join(source, "manifest.json"), 16 * 1024));
    if (manifest.format !== 1 || manifest.profile !== profile.id || manifest.sourceCommit !== profile.sourceCommit ||
      manifest.lumenCommit !== profile.windowManagerCommit || manifest.file !== "context.tar.gz" ||
      !Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > maximumSourceBytes ||
      typeof manifest.sha256 !== "string" || !sha256Pattern.test(manifest.sha256)) {
      return { state: "source-mismatch" };
    }
    context = await readBundledFile(path.join(source, "context.tar.gz"), manifest.size);
    if (context.length !== manifest.size || createHash("sha256").update(context).digest("hex") !== manifest.sha256) {
      return { state: "source-mismatch" };
    }
  } catch (error) {
    return { state: error.code === "ENOENT" ? "package-unavailable" : "source-mismatch" };
  }

  progress({ state: "source-building" });
  try {
    const config = path.join(directory, "docker-config"), iidFile = path.join(directory, "image-id");
    await mkdir(config, { mode: 0o700 });
    const docker = dockerDesktopRoot(process.platform, env, engine.binary);
    if (docker) await writeFile(path.join(config, "config.json"), JSON.stringify({ cliPluginsExtraDirs: [path.join(docker, "cli-plugins")] }), { mode: 0o600 });
    const command = ["--config", config, "--host", engine.host];
    const options = dockerOptions(env, 30 * 60_000, signal);
    options.env.DOCKER_BUILDKIT = "1";
    await build(engine.binary, [...command, "build", "--load", "--quiet", "--iidfile", iidFile,
      "--build-arg", `LUMEN_COMMIT=${profile.windowManagerCommit}`,
      "--build-arg", `LEXOPEN_DESKTOP_PROFILE=${profile.id}`, "--build-arg", `LEXOPEN_DESKTOP_SOURCE=${profile.sourceCommit}`, "-"], options, context);
    const imageId = (await readBundledFile(iidFile, 128)).toString("utf8").trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || !await desktopProfilePresent(engine, { execute, env, architecture, reference: imageId, signal })) {
      return { state: "source-build-failed" };
    }
    await execute(engine.binary, [...command, "image", "tag", imageId, profile.tag], dockerOptions(env, 3000, signal));
    const loaded = await desktopProfilePresent(engine, { execute, env, architecture, expectedId: imageId, signal });
    return { state: loaded ? "package-loaded" : "source-build-failed" };
  } catch { return { state: "source-build-failed" }; }
}

async function prepareDesktopToolpack(version, {
  execute = runFile, build = buildFromContext, fetcher = fetch, env = process.env, resourceRoot,
  progress = () => {}, signal,
} = {}) {
  progress({ state: "package-checking" });
  const engine = await localDesktopEngine({ execute, env, signal });
  if (engine.state !== "engine-ready") return { state: engine.state };
  let architecture;
  try {
    const reply = await execute(engine.binary, ["--host", engine.host, "version", "--format", "{{.Server.Arch}}"], dockerOptions(env, 3000, signal));
    architecture = reply.stdout.trim();
  } catch { return { state: "engine-unavailable" }; }
  if (!supportedArchitectures.has(architecture)) return { state: "engine-architecture-unsupported" };
  if (await desktopProfilePresent(engine, { execute, env, architecture, signal })) return { state: "profile-detected" };

  const verified = await lookupDesktopToolpack(version, architecture, fetcher, signal);
  if (signal?.aborted) return { state: "package-cancelled" };
  let directory;
  try {
    directory = await mkdtemp(path.join(tmpdir(), "lexopen-desktop-tools-"));
    if (verified.state !== "package-verified") {
      const fallback = await prepareSource(resourceRoot, directory, engine, architecture, { execute, build, env, progress, signal });
      return fallback.state === "package-unavailable" ? verified : fallback;
    }
    const staged = path.join(directory, "official-package.tar.gz");
    progress({ state: "package-downloading", percent: 0 });
    try {
      if (!await downloadArchive(verified.asset, staged, fetcher, progress, signal)) return { state: "package-mismatch" };
    } catch { return { state: "package-download-failed" }; }
    progress({ state: "package-loading" });
    try {
      await execute(engine.binary, ["--host", engine.host, "image", "load", "--input", staged], dockerOptions(env, 10 * 60_000, signal));
      const checked = await desktopProfilePresent(engine, { execute, env, architecture, signal });
      return { state: checked ? "package-loaded" : "package-load-unconfirmed" };
    } catch { return { state: "package-load-unconfirmed" }; }
  } catch { return { state: "package-read-failed" }; }
  finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); }
}

module.exports = { maximumArchiveBytes, toolpackName, toolpackReceiptName, selectOfficialToolpack, prepareDesktopToolpack };
