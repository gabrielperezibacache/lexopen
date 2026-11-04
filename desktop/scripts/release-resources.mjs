import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const RELEASE_TARGETS = ["darwin-x64", "darwin-arm64", "win32-x64", "linux-x64"];
const forbiddenDirectories = new Set([".git", ".tmp", ".codex", ".agents", ".links", ".cache", "storage", "pgdata", "vault", "obsidian-vault", "backups", "private", "secrets", "test-results", "playwright-report"]);
const forbiddenFiles = new Set(["credentials.json", "tokens.json", "auth.json", "desktop-config.json", "app-state.json", "rate-limit.json", "session-state.json"]);
export function privateResourcePath(relative) {
  const parts = relative.replaceAll("\\", "/").split("/").filter(Boolean);
  const joined = parts.join("/"), basename = parts.at(-1) || "";
  const sqlDump = /\.sql$/i.test(basename) && !parts.includes("node_modules") && !/(?:^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/.test(joined);
  return parts.some(part => forbiddenDirectories.has(part.toLowerCase()) || part.startsWith(".postgres-init-")) || /^pg-password-/i.test(basename) || forbiddenFiles.has(basename.toLowerCase()) || sqlDump || /(?:^|\/)\.next\/cache(?:\/|$)/i.test(joined) || parts.some(part => /\.env(?:\.|$)/i.test(part)) || /(?:^|\/)(?:id_rsa|id_ed25519|postmaster\.pid|pg_version)(?:$|\.)/i.test(joined) || /\.(?:pem|key|p12|pfx|sqlite3?|db|dump|log)$/i.test(basename);
}
export function nativeTarget(platform, arch, host = process) {
  const target = `${platform}-${arch}`;
  if (!RELEASE_TARGETS.includes(target)) throw new Error(`Unsupported release target: ${target}`);
  if (platform !== host.platform || arch !== host.arch) throw new Error(`Native release required: ${target}; current runner is ${host.platform}-${host.arch}`);
  return { platform, arch, target };
}
export function parseTargetArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--platform", "--arch"].includes(args[i]) || !args[i + 1] || values[args[i]]) throw new Error("Use --platform <darwin|win32|linux> --arch <x64|arm64>");
    values[args[i]] = args[i + 1];
  }
  return nativeTarget(values["--platform"] || process.platform, values["--arch"] || process.arch);
}
export function binaryIdentity(bytes) {
  if (bytes.length < 24) throw new Error("Truncated native binary");
  if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    if (bytes[4] !== 2 || ![1, 2].includes(bytes[5])) throw new Error("Unsupported ELF binary");
    const cpu = bytes[5] === 1 ? bytes.readUInt16LE(18) : bytes.readUInt16BE(18);
    return { platform: "linux", architectures: [cpu === 62 ? "x64" : cpu === 183 ? "arm64" : "unsupported"] };
  }
  if (bytes.readUInt16LE(0) === 0x5a4d) {
    if (bytes.length < 64) throw new Error("Truncated PE binary");
    const offset = bytes.readUInt32LE(0x3c);
    if (offset + 6 > bytes.length || bytes.readUInt32LE(offset) !== 0x4550) throw new Error("Invalid PE binary");
    const cpu = bytes.readUInt16LE(offset + 4);
    return { platform: "win32", architectures: [cpu === 0x8664 ? "x64" : cpu === 0xaa64 ? "arm64" : "unsupported"] };
  }
  const magic = bytes.readUInt32BE(0);
  const cpuName = cpu => cpu === 0x01000007 ? "x64" : cpu === 0x0100000c ? "arm64" : "unsupported";
  if ([0xcffaedfe, 0xfeedfacf].includes(magic)) return { platform: "darwin", architectures: [cpuName(magic === 0xcffaedfe ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4))] };
  if ([0xcafebabe, 0xcafebabf].includes(magic)) {
    const count = bytes.readUInt32BE(4), size = magic === 0xcafebabf ? 32 : 20;
    if (count < 1 || count > 16 || 8 + count * size > bytes.length) throw new Error("Invalid universal Mach-O binary");
    return { platform: "darwin", architectures: Array.from({ length: count }, (_, i) => cpuName(bytes.readUInt32BE(8 + i * size))) };
  }
  throw new Error("Unrecognized native binary");
}
export function verifyBinary(file, target) {
  const fd = fs.openSync(file, "r");
  let bytes;
  try { bytes = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 65_536)); fs.readSync(fd, bytes, 0, bytes.length, 0); }
  finally { fs.closeSync(fd); }
  const info = binaryIdentity(bytes);
  if (info.platform !== target.platform || !info.architectures.includes(target.arch) || info.architectures.includes("unsupported")) throw new Error(`Native binary does not match ${target.target}: ${path.basename(file)}`);
  return info;
}
function contained(root, file) { const relative = path.relative(root, file); return relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
/** Materialize internal links, plus explicitly scoped Next-generated dependency aliases. */
export function copyResourceTree(source, destination, { stripped = [], boundary = source, relative = "", ancestors = new Set(), nextNodeModulesRoot } = {}) {
  if (privateResourcePath(relative || path.basename(source))) { stripped.push(relative || path.basename(source)); return; }
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    if (!relative) throw new Error("Release input roots must not be symlinks");
    let real;
    try { real = fs.realpathSync(source); }
    catch { throw new Error(`Unresolvable resource symlink rejected (target=missing-or-cyclic): ${relative}`); }
    let realBoundary = fs.realpathSync(boundary), modulesBoundary;
    if (nextNodeModulesRoot) {
      const modulesStat = fs.lstatSync(nextNodeModulesRoot);
      if (modulesStat.isSymbolicLink() || !modulesStat.isDirectory() || path.basename(nextNodeModulesRoot) !== "node_modules") throw new Error("Next dependency alias root must be a real node_modules directory");
      modulesBoundary = fs.realpathSync(nextNodeModulesRoot);
    }
    if (!contained(realBoundary, real)) {
      // Next 16 on Windows externalizes packages as generated junctions here.
      // This exception never applies to arbitrary source links or outside roots.
      const generatedAlias = /^\.next\/node_modules\/(?:@[^/]+\/)?[^/]+$/.test(relative.replaceAll("\\", "/"));
      if (!modulesBoundary || !generatedAlias) throw new Error(`External resource symlink rejected: ${relative}`);
      if (real === modulesBoundary || !contained(modulesBoundary, real)) throw new Error(`External Next dependency alias rejected (target=outside-checkout-node_modules): ${relative}`);
      realBoundary = modulesBoundary;
    }
    const realRelative = path.relative(realBoundary, real);
    const publicRelative = realBoundary === modulesBoundary ? `node_modules/${realRelative}` : realRelative;
    if (privateResourcePath(publicRelative)) throw new Error(`Private resource symlink rejected: ${relative}`);
    if (ancestors.has(real)) throw new Error(`Cyclic resource symlink rejected: ${relative}`);
    return copyResourceTree(real, destination, { stripped, boundary: realBoundary, relative, ancestors: new Set([...ancestors, real]), nextNodeModulesRoot });
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) copyResourceTree(path.join(source, name), path.join(destination, name), { stripped, boundary, relative: relative ? `${relative}/${name}` : name, ancestors, nextNodeModulesRoot });
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); fs.chmodSync(destination, stat.mode & 0o777);
  } else throw new Error(`Unsupported resource file type: ${relative}`);
}
export function resourceFiles(root, prefix = "") {
  const result = [];
  for (const name of fs.readdirSync(root).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name, file = path.join(root, name), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Packaged resource symlink rejected: ${relative}`);
    if (privateResourcePath(relative)) throw new Error(`Private resource rejected: ${relative}`);
    if (stat.isDirectory()) result.push(...resourceFiles(file, relative));
    else if (stat.isFile()) result.push(relative);
    else throw new Error(`Unsupported packaged resource: ${relative}`);
  }
  return result;
}
function allFiles(root, { publicPrefix = "" } = {}) {
  const boundary = fs.realpathSync(root), files = [];
  const privatePath = relative => privateResourcePath(publicPrefix ? `${publicPrefix}/${relative}` : relative);
  const visit = (file, relative, ancestors) => {
    if (privatePath(relative)) throw new Error(`Private native resource rejected: ${relative}`);
    const real = fs.realpathSync(file), stat = fs.statSync(file);
    if (!contained(boundary, real)) throw new Error(`External native resource symlink rejected: ${relative}`);
    if (privatePath(path.relative(boundary, real))) throw new Error(`Private native resource symlink rejected: ${relative}`);
    if (stat.isDirectory()) {
      if (ancestors.has(real)) throw new Error(`Cyclic native resource symlink rejected: ${relative}`);
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name), relative ? `${relative}/${name}` : name, new Set([...ancestors, real]));
    } else if (stat.isFile()) files.push(file);
    else throw new Error(`Unsupported native resource: ${relative}`);
  };
  visit(root, "", new Set()); return files;
}
function required(file) { if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing release resource: ${path.basename(file)}`); }
export function verifyNativeRuntime(resources, nodeModules, target) {
  const app = path.join(resources, "app-standalone"), client = path.join(app, "node_modules", ".prisma", "client");
  if (!fs.existsSync(client)) throw new Error("Missing generated Prisma client in standalone");
  const queries = allFiles(client).filter(file => /(?:libquery_engine|query_engine|query-engine)/.test(path.basename(file)) && !/\.(?:js|ts|json|wasm|map|md|prisma)$/.test(file));
  if (!queries.length) throw new Error("Missing native Prisma query engine");
  for (const file of queries) verifyBinary(file, target);
  const engines = path.join(nodeModules, "@prisma", "engines");
  if (!fs.existsSync(engines)) throw new Error("Missing bundled Prisma migration engines");
  const schemas = fs.readdirSync(engines).filter(name => /^(?:schema|migration)-engine-/.test(name) && !/\.(?:js|md|json|sha256)$/.test(name));
  if (!schemas.length) throw new Error("Missing native Prisma schema engine");
  for (const name of schemas) verifyBinary(path.join(engines, name), target);
  const packageName = `${target.platform === "win32" ? "windows" : target.platform}-${target.arch}`;
  const pgRoot = path.join(nodeModules, "@embedded-postgres", packageName);
  if (!fs.existsSync(pgRoot)) throw new Error(`Missing native embedded PostgreSQL package: ${packageName}`);
  // This subtree is the verified public dependency, whose PostgreSQL distribution
  // includes SQL for bootstrap and extension upgrades. Keep that package context
  // for both visible paths and internal link targets; other scans stay unchanged.
  const pgFiles = allFiles(pgRoot, { publicPrefix: `node_modules/@embedded-postgres/${packageName}` });
  for (const name of ["postgres", "initdb", "pg_ctl"]) {
    const matches = pgFiles.filter(file => path.basename(file) === `${name}${target.platform === "win32" ? ".exe" : ""}`);
    if (!matches.length) throw new Error(`Missing PostgreSQL executable: ${name}`);
    for (const file of matches) verifyBinary(file, target);
  }
  for (const file of pgFiles.filter(file => /\.(?:dll|dylib)$/.test(file))) verifyBinary(file, target);
  for (const name of ["prisma/build/index.js", "tsx/dist/cli.mjs", "embedded-postgres/dist/index.js"]) required(path.join(nodeModules, name));
  return { queryEngines: queries.length, schemaEngines: schemas.length, postgresPackage: packageName };
}
export function verifyReleaseResources(resources, nodeModules, target) {
  const files = allFiles(resources).map(file => path.relative(resources, file).split(path.sep).join("/")), app = path.join(resources, "app-standalone");
  for (const name of ["server.js", ".next/BUILD_ID", "package.json", "tsconfig.json", "src/lib/db.ts", "scripts/local-host-schedulers.mjs", "scripts/host-smoke-runner.mjs", "lexopen-release.json"]) required(path.join(app, name));
  required(path.join(resources, "prisma/schema.prisma")); required(path.join(app, "prisma/seed.ts"));
  if (!files.some(name => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(name))) throw new Error("Missing Prisma migrations");
  if (!files.some(name => name.startsWith("app-standalone/.next/static/"))) throw new Error("Missing Next static assets");
  const meta = JSON.parse(fs.readFileSync(path.join(app, "lexopen-release.json"), "utf8"));
  if (typeof meta.version !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(meta.version) || typeof meta.sourceDirty !== "boolean" || typeof meta.sourceRevision !== "string" || !/^[a-f0-9]{40,64}$/.test(meta.sourceRevision)) throw new Error("Invalid public release metadata");
  if (meta.platform !== target.platform || meta.arch !== target.arch || meta.buildId !== fs.readFileSync(path.join(app, ".next/BUILD_ID"), "utf8").trim()) throw new Error("Release identity does not match staged build/target");
  const browsers = path.join(app, "playwright-browsers");
  if (!fs.existsSync(browsers)) throw new Error("Missing isolated Playwright Chromium browser cache");
  const chromium = allFiles(browsers).filter(file => ["chrome", "chrome.exe", "Chromium", "Google Chrome for Testing"].includes(path.basename(file)));
  if (!chromium.length) throw new Error("Missing bundled Chromium executable");
  for (const file of chromium) verifyBinary(file, target);
  const native = verifyNativeRuntime(resources, nodeModules, target);
  return { version: meta.version, sourceDirty: meta.sourceDirty, files: files.length, buildId: meta.buildId, sourceRevision: meta.sourceRevision, native, browserExecutables: chromium.length };
}
function regularDirectory(root, label) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a real directory`);
  return fs.realpathSync(root);
}
function contentHash(file) {
  const hash = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), chunk = Buffer.alloc(262_144);
  try {
    for (;;) { const count = fs.readSync(fd, chunk, 0, chunk.length, null); if (!count) break; hash.update(chunk.subarray(0, count)); }
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
}
/** Copy the complete audited runtime without electron-builder dependency filters. */
export function copyStagedReleaseResources(stage, resources, sourceNodeModules, target) {
  const sourceRoot = regularDirectory(stage, "Release staging"), destinationRoot = regularDirectory(resources, "Packaged resources");
  if (contained(sourceRoot, destinationRoot) || contained(destinationRoot, sourceRoot)) throw new Error("Staged and packaged resource directories must be separate");
  // Reject private or linked staging entries before changing the package.
  const scopes = ["app-standalone", "prisma"], expected = resourceFiles(stage).sort();
  if (expected.some(file => !scopes.some(scope => file.startsWith(`${scope}/`)))) throw new Error("Unexpected staged resource scope");
  verifyReleaseResources(stage, sourceNodeModules, target);
  for (const scope of scopes) {
    regularDirectory(path.join(stage, scope), "Staged runtime scope");
    const destination = path.join(resources, scope);
    let stat;
    try { stat = fs.lstatSync(destination); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error("Packaged runtime scope must be a real directory");
  }
  for (const scope of scopes) {
    const destination = path.join(resources, scope);
    fs.rmSync(destination, { recursive: true, force: true });
    copyResourceTree(path.join(stage, scope), destination, { boundary: stage, relative: scope });
  }
  const actual = scopes.flatMap(scope => resourceFiles(path.join(resources, scope), scope)).sort();
  if (actual.length !== expected.length || actual.some((file, i) => file !== expected[i])) throw new Error("Packaged runtime file inventory differs from staging");
  for (const file of expected) {
    const source = path.join(stage, file), destination = path.join(resources, file), sourceStat = fs.statSync(source), destinationStat = fs.statSync(destination);
    if (sourceStat.size !== destinationStat.size || contentHash(source) !== contentHash(destination) || process.platform !== "win32" && (sourceStat.mode & 0o777) !== (destinationStat.mode & 0o777)) throw new Error(`Packaged runtime differs from staging: ${file}`);
  }
  return { copiedFiles: actual.length };
}
export function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
export function verifyCanaryAbsent(root, canary) {
  if (!canary) return;
  if (typeof canary !== "string" || canary.length < 16 || canary.length > 512) throw new Error("Invalid release canary");
  const isFile = fs.statSync(root).isFile(), base = isFile ? path.dirname(root) : root;
  const needle = Buffer.from(canary), files = isFile ? [path.basename(root)] : resourceFiles(root);
  for (const relative of files) {
    const fd = fs.openSync(path.join(base, relative), "r"), chunk = Buffer.alloc(65_536); let tail = Buffer.alloc(0);
    try {
      for (;;) {
        const count = fs.readSync(fd, chunk, 0, chunk.length, null); if (!count) break;
        const bytes = Buffer.concat([tail, chunk.subarray(0, count)]);
        if (bytes.includes(needle)) throw new Error("Private build canary found in packaged resources");
        tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - needle.length + 1)));
      }
    } finally { fs.closeSync(fd); }
  }
}
export function trackedPublicFiles(repo) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached"], { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error("A public Git checkout is required to stage release sources");
  return [...new Set(result.stdout.split("\0").filter(Boolean))].filter(file => !privateResourcePath(file));
}
