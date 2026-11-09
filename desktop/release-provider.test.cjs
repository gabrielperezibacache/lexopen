const assert = require("node:assert/strict");
const { createClient } = require("electron-updater/out/providerFactory");
const { NsisUpdater } = require("electron-updater/out/NsisUpdater");
const { HttpError } = require("builder-util-runtime");
const { officialReleaseProvider, ReleaseProvider } = require("./release-provider.cjs");
const { applyUpdaterPolicy } = require("./update-policy.cjs");

async function check({ channel = "preview", current = "1.1.0-preview.8", stable = "1.1.0", preview = "1.1.0-preview.8", missing = [], platform = "win32" } = {}) {
  const updater = new NsisUpdater(null, { version: current });
  updater.logger = null;
  applyUpdaterPolicy(updater, { updateChannel: channel });
  const requests = [];
  const feedSuffix = platform === "darwin" ? "-mac" : platform === "linux" ? "-linux" : "";
  const assetSuffix = platform === "darwin" ? "mac-x64.zip" : platform === "linux" ? "linux-x86_64.AppImage" : "win-x64.exe";
  const atom = `<feed>${[stable, preview].filter(Boolean).map(version => `<entry><title>LexOpen ${version}</title><link href="https://github.com/gabrielperezibacache/lexopen/releases/tag/v${version}"/></entry>`).join("")}</feed>`;
  const executor = { request: async options => {
    requests.push(options.path);
    if (options.path.endsWith(".atom")) return atom;
    if (options.path.endsWith("/latest")) return JSON.stringify({ tag_name: `v${stable}` });
    if (missing.some(channel => options.path.endsWith(`/${channel}${feedSuffix}.yml`))) throw new HttpError(404);
    let version;
    if (options.path.endsWith(`/v${preview}/preview${feedSuffix}.yml`)) version = preview;
    else if (options.path.endsWith(`/v${stable}/latest${feedSuffix}.yml`)) version = stable;
    else throw new HttpError(404);
    return JSON.stringify({ version, files: [{ url: `LexOpen-${version}-${assetSuffix}`, sha512: "fixture-hash", size: 10 }] });
  } };
  const provider = createClient(officialReleaseProvider, updater, { platform, executor });
  assert.ok(provider instanceof ReleaseProvider, "use electron-updater's supported custom provider API");
  const info = await provider.getLatestVersion();
  const files = provider.resolveFiles(info);
  assert.equal(files[0].url.pathname, `/gabrielperezibacache/lexopen/releases/download/v${info.version}/LexOpen-${info.version}-${assetSuffix}`);
  assert.equal(files[0].info.sha512, "fixture-hash", "preserve the feed hash for the normal download verifier");
  return { info, updater, requests };
}

async function main() {
  let result = await check();
  assert.equal(result.info.version, "1.1.0", "a stable release upgrades a preview of the same version");
  assert.equal(await result.updater.isUpdateAvailable(result.info), true);
  assert.equal(result.updater.channel, "preview", "selecting stable does not change the user's channel preference");
  assert.equal(result.updater.allowDowngrade, false);
  assert.equal(result.updater.autoDownload, false);
  assert.equal(result.updater.autoInstallOnAppQuit, false);
  for (const platform of ["darwin", "linux"]) {
    result = await check({ platform });
    assert.equal(result.info.version, "1.1.0", `stable selection preserves the ${platform} feed`);
  }

  result = await check({ preview: "1.2.0-preview.1" });
  assert.equal(result.info.version, "1.2.0-preview.1", "preview users receive the newer preview when both channels exist");
  result = await check({ channel: "stable", current: "1.0.0", preview: "1.2.0-preview.1" });
  assert.equal(result.info.version, "1.1.0");
  assert.ok(result.requests.every(url => !url.endsWith("/preview.yml")), "stable checks never fetch the preview feed");

  result = await check({ stable: "1.0.0", preview: "1.1.0-preview.8", missing: ["latest"] });
  assert.equal(result.info.version, "1.1.0-preview.8", "a legacy stable release without updater assets does not hide preview");
  assert.equal(await result.updater.isUpdateAvailable(result.info), false, "equal versions are not reinstalled");
  result = await check({ missing: ["preview"] });
  assert.equal(result.info.version, "1.1.0", "stable remains available when preview has no feed");
  result = await check({ current: "1.2.0-preview.1" });
  assert.equal(await result.updater.isUpdateAvailable(result.info), false, "the real updater blocks downgrade after resolving both channels");
  await assert.rejects(check({ missing: ["latest", "preview"] }), /Cannot find/);
  console.log("release-provider.test.cjs OK (real GitHub providers with mocked HTTP)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
