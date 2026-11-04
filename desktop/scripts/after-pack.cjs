const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

module.exports = async function afterPack(context) {
  const { nativeTarget, privateResourcePath, copyStagedReleaseResources, verifyBinary, verifyReleaseResources, verifyCanaryAbsent } = await import("./release-resources.mjs");
  const architecture = { 1: "x64", 3: "arm64" }[context.arch];
  const target = nativeTarget(context.electronPlatformName, architecture);
  const appDirectory = target.platform === "darwin" ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`) : context.appOutDir;
  const resources = target.platform === "darwin" ? path.join(appDirectory, "Contents", "Resources") : path.join(appDirectory, "resources");
  const executable = target.platform === "darwin" ? path.join(appDirectory, "Contents", "MacOS", "lexopen") : path.join(appDirectory, target.platform === "win32" ? "lexopen.exe" : "lexopen");
  verifyBinary(executable, target);
  for (const entry of asar.listPackage(path.join(resources, "app.asar"))) if (privateResourcePath(entry)) throw new Error(`Private file in application archive: ${entry}`);
  const desktop = path.resolve(__dirname, "..");
  copyStagedReleaseResources(path.join(desktop, ".release", "resources"), resources, path.join(desktop, "node_modules"), target);
  const verified = verifyReleaseResources(resources, path.join(resources, "app.asar.unpacked", "node_modules"), target);
  const appPackage = JSON.parse(asar.extractFile(path.join(resources, "app.asar"), "package.json").toString("utf8"));
  if (appPackage.version !== verified.version) throw new Error("Desktop and staged application versions differ");
  verifyCanaryAbsent(path.join(resources, "app-standalone"), process.env.LEXOPEN_RELEASE_CANARY);
  verifyCanaryAbsent(path.join(resources, "app.asar"), process.env.LEXOPEN_RELEASE_CANARY);
  for (const file of ["host-runtime.mjs", "config.cjs", "package.json"]) if (!fs.existsSync(path.join(resources, "app.asar.unpacked", file))) throw new Error(`Missing unpacked Host runtime: ${file}`);
  const dist = context.outDir;
  const report = { format: 1, platform: target.platform, arch: target.arch, appDirectory: path.relative(dist, appDirectory).split(path.sep).join("/"), ...verified };
  fs.writeFileSync(path.join(dist, `lexopen-packaged-${target.target}.json`), JSON.stringify(report, null, 2));
};
