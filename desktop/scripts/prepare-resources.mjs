import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyResourceTree, LINUX_PRISMA_BINARY_TARGETS, parseTargetArgs, privateResourcePath, sha256, stageDistributedOAuthProfile, trackedPublicFiles, verifyBinary, verifyDesktopSourceResource, verifyReleaseResources, verifyCanaryAbsent } from "./release-resources.mjs";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), repo = path.dirname(desktop);
function loadPrismaDownload(directory) {
  const require = createRequire(path.join(directory, "package.json"));
  return { download: require("@prisma/fetch-engine").download, enginesVersion: require("@prisma/engines-version").enginesVersion };
}
/** Keep target-specific compatibility engines out of the shared Prisma schema. */
export async function preparePrismaRuntimeEngines(sourceRepo, output, target, { loadPrisma = loadPrismaDownload } = {}) {
  if (target.platform !== "linux") return;
  const app = loadPrisma(sourceRepo), cli = loadPrisma(path.join(sourceRepo, "desktop"));
  const client = path.join(output, "app-standalone", "node_modules", ".prisma", "client");
  const engines = path.join(sourceRepo, "desktop", "node_modules", "@prisma", "engines");
  if (!fs.existsSync(client)) throw new Error("Missing generated Prisma client before preparing compatibility engines");
  // fetch-engine can trust an existing non-native engine without checking its
  // revision when there is no verified cache. Empty download directories force
  // every compatibility engine through its pinned cache/upstream SHA256 check.
  const options = { binaryTargets: [...LINUX_PRISMA_BINARY_TARGETS], showProgress: true, failSilent: false };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-prisma-engines-"));
  const appDownload = path.join(temporary, "app"), cliDownload = path.join(temporary, "cli");
  try {
    fs.mkdirSync(appDownload); fs.mkdirSync(cliDownload);
    await app.download({ ...options, version: app.enginesVersion, binaries: { "libquery-engine": appDownload } });
    await cli.download({ ...options, version: cli.enginesVersion, binaries: { "libquery-engine": cliDownload, "schema-engine": cliDownload } });
    for (const binaryTarget of LINUX_PRISMA_BINARY_TARGETS) {
      for (const [directory, destination, name] of [
        [appDownload, client, `libquery_engine-${binaryTarget}.so.node`],
        [cliDownload, engines, `libquery_engine-${binaryTarget}.so.node`],
        [cliDownload, engines, `schema-engine-${binaryTarget}`],
      ]) {
        const source = path.join(directory, name), stat = fs.lstatSync(source);
        if (!stat.isFile()) throw new Error("Downloaded Prisma engine must be a regular file");
        verifyBinary(source, target);
        const outputFile = path.join(destination, name);
        fs.copyFileSync(source, outputFile); fs.chmodSync(outputFile, stat.mode & 0o777);
      }
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
export function copyTrackedRuntimeResources(sourceRepo, output, { stripped = [] } = {}) {
  const app = path.join(output, "app-standalone");
  const runtimeFiles = new Set(["tsconfig.json", "next-env.d.ts", "scripts/local-host-schedulers.mjs", "desktop/scripts/host-smoke-runner.mjs", "desktop/oauth-clients.cjs", "LICENSE"]);
  for (const file of trackedPublicFiles(sourceRepo)) {
    if (!(file.startsWith("src/") || file.startsWith("public/") || file.startsWith("prisma/") || runtimeFiles.has(file)) || privateResourcePath(file)) continue;
    const source = path.join(sourceRepo, file), stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Public source must be a regular file: ${file}`);
    const destination = file === "desktop/scripts/host-smoke-runner.mjs" ? "scripts/host-smoke-runner.mjs" : file;
    // Keep the repository-relative identity when copying one file: migration.sql
    // is public only inside prisma/migrations/<id>, unlike an arbitrary SQL dump.
    copyResourceTree(source, path.join(app, destination), { stripped, boundary: sourceRepo, relative: file });
    if (file.startsWith("prisma/")) copyResourceTree(source, path.join(output, file), { stripped, boundary: sourceRepo, relative: file });
  }
}
export async function prepareReleaseResources(target) {
  const output = path.join(desktop, ".release", "resources");
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("Release staging directory must not be a symlink");
  for (const file of [".next/standalone/server.js", ".next/BUILD_ID", "desktop/scripts/host-smoke-runner.mjs"]) if (!fs.existsSync(path.join(repo, file))) throw new Error(`Build prerequisite missing: ${file}`);
  const cache = path.join(desktop, ".release", "playwright-browsers");
  if (!fs.existsSync(cache) || fs.lstatSync(cache).isSymbolicLink()) throw new Error("Install Chromium into desktop/.release/playwright-browsers before staging");
  const desktopSource = path.join(desktop, ".release", "altazor-desktop-source");
  if (!fs.existsSync(desktopSource)) throw new Error("Prepare the pinned Altazor desktop source before building installers");
  verifyDesktopSourceResource(desktopSource);
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" });
  if (revision.status !== 0 || !/^[a-f0-9]{40,64}$/.test(revision.stdout.trim())) throw new Error("Cannot identify the public source revision");
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: repo, encoding: "utf8" });
  if (dirty.status !== 0) throw new Error("Cannot verify source state");
  if (dirty.stdout.trim()) throw new Error(`Build changed the public checkout; commit the intended generated inputs before packaging:\n${dirty.stdout.trim()}`);
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  const app = path.join(output, "app-standalone"), stripped = [];
  copyResourceTree(path.join(repo, ".next/standalone"), app, { stripped, nextNodeModulesRoot: path.join(repo, "node_modules") });
  copyResourceTree(path.join(repo, ".next/static"), path.join(app, ".next/static"), { stripped });
  // Only versioned/public application inputs enter these additional resource scopes.
  copyTrackedRuntimeResources(repo, output, { stripped });
  for (const name of ["playwright", "playwright-core"]) copyResourceTree(path.join(repo, "node_modules", name), path.join(app, "node_modules", name), { stripped });
  copyResourceTree(cache, path.join(app, "playwright-browsers"), { stripped });
  copyResourceTree(desktopSource, path.join(output, "altazor-desktop-source"), { stripped });
  const distributedOAuth = stageDistributedOAuthProfile(output);
  await preparePrismaRuntimeEngines(repo, output, target);
  const buildId = fs.readFileSync(path.join(repo, ".next/BUILD_ID"), "utf8").trim();
  if (!/^[\w.-]{1,256}$/.test(buildId)) throw new Error("Invalid Next build identity");
  const version = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf8")).version;
  const metadata = { format: 1, version, platform: target.platform, arch: target.arch, sourceRevision: revision.stdout.trim(), sourceDirty: Boolean(dirty.stdout.trim()), buildId, sourceIconSha256: sha256(path.join(repo, "docs/assets/lexopen-lockup.png")), ...(distributedOAuth ? { distributedOAuthSha256: distributedOAuth.sha256 } : {}) };
  fs.writeFileSync(path.join(app, "lexopen-release.json"), JSON.stringify(metadata, null, 2));
  const verified = verifyReleaseResources(output, path.join(desktop, "node_modules"), target);
  verifyCanaryAbsent(output, process.env.LEXOPEN_RELEASE_CANARY);
  const report = { ...metadata, verified, strippedEntries: stripped.length };
  fs.writeFileSync(path.join(desktop, ".release", "resources-report.json"), JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await prepareReleaseResources(parseTargetArgs(process.argv.slice(2))))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Release staging failed"); process.exitCode = 1; }
}
