const { GitHubProvider } = require("electron-updater/out/providers/GitHubProvider");
const { compareVersions } = require("./update-policy.cjs");

// GitHubProvider treats "preview" as a custom channel and excludes stable
// releases. Include the stable provider too so a preview can graduate normally.
class ReleaseProvider extends GitHubProvider {
  async getLatestVersion() {
    if (!this.updater.allowPrerelease || this.updater.channel !== "preview") {
      return super.getLatestVersion();
    }
    const stable = new GitHubProvider(this.options, {
      channel: "latest",
      allowPrerelease: false,
      currentVersion: this.updater.currentVersion,
      fullChangelog: this.updater.fullChangelog,
    }, this.runtimeOptions);
    stable.setRequestHeaders(this.requestHeaders);
    const results = await Promise.allSettled([super.getLatestVersion(), stable.getLatestVersion()]);
    const candidates = results.filter(result => result.status === "fulfilled").map(result => result.value);
    if (!candidates.length) throw results[0].reason;
    // An unavailable channel does not hide a valid release from the other one.
    // AppUpdater still checks version, staging, hashes and publisher signatures.
    return candidates.reduce((latest, candidate) => compareVersions(candidate.version, latest.version) > 0 ? candidate : latest);
  }
}

const officialReleaseProvider = {
  provider: "custom",
  owner: "gabrielperezibacache",
  repo: "lexopen",
  updateProvider: ReleaseProvider,
};

module.exports = { ReleaseProvider, officialReleaseProvider };
