import assert from "node:assert/strict";
import { checkForAppUpdate, clearUpdateCheckCache } from "./update-check";

async function main() {
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  let requests = 0;
  let respond: () => Response = () => Response.json({ tag_name: "v1.1.0", name: "LexOpen 1.1.0" });
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), "https://api.github.com/repos/gabrielperezibacache/lexopen/releases/latest");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal, "remote checks have a timeout");
    return respond();
  };
  process.env.LEXOPEN_APP_VERSION = "1.1.0-preview.8";
  delete process.env.LEXOPEN_GITHUB_REPO;
  delete process.env.LEXOPEN_UPDATE_CHECK;
  delete process.env.LEXOPEN_DESKTOP;
  try {
    clearUpdateCheckCache();
    const stable = await checkForAppUpdate();
    assert.equal(stable.checked, true);
    assert.equal(stable.updateAvailable, true, "stable release must be offered to a preview with the same core version");
    assert.equal(stable.currentVersion, "1.1.0-preview.8");
    assert.equal(stable.latestVersion, "1.1.0");
    assert.equal(stable.releaseUrl, "https://github.com/gabrielperezibacache/lexopen/releases");
    await checkForAppUpdate();
    assert.equal(requests, 1, "normal checks reuse the one-hour cache");
    await checkForAppUpdate({ force: true });
    assert.equal(requests, 2, "an explicit check bypasses the cache");

    for (const release of [
      { tag_name: "v1.2.0-preview.1", prerelease: true },
      { tag_name: "v1.2.0-preview.1", prerelease: false },
      { tag_name: "v1.2.0", draft: true },
      { tag_name: "v1.1.0-preview.01" },
      { tag_name: "v1.2.0+" },
      { tag_name: "not-a-version" },
    ]) {
      respond = () => Response.json(release);
      assert.equal((await checkForAppUpdate({ force: true })).updateAvailable, false, JSON.stringify(release));
    }

    respond = () => new Response(null, { status: 404 });
    const missing = await checkForAppUpdate({ force: true });
    assert.equal(missing.checked, true);
    assert.equal(missing.updateAvailable, false);
    assert.equal(missing.latestVersion, null);

    respond = () => new Response(null, { status: 429 });
    const limited = await checkForAppUpdate({ force: true });
    assert.equal(limited.checked, false);
    assert.equal(limited.updateAvailable, false);
    assert.match(limited.error!, /HTTP 429/);
    const beforeCachedFailure = requests;
    await checkForAppUpdate();
    assert.equal(requests, beforeCachedFailure, "rate limits use a negative cache");

    respond = () => { throw new Error("offline"); };
    const offline = await checkForAppUpdate({ force: true });
    assert.equal(offline.checked, false);
    assert.equal(offline.updateAvailable, false);
    assert.equal(offline.error, "offline");

    process.env.LEXOPEN_UPDATE_CHECK = "0";
    const beforeDisabled = requests;
    const disabled = await checkForAppUpdate({ force: true });
    assert.equal(disabled.disabled, true);
    assert.equal(disabled.updateAvailable, false);
    assert.equal(requests, beforeDisabled, "disabled checks never contact GitHub");
    console.log("update-check.test.ts OK (mocked GitHub responses)");
  } finally {
    globalThis.fetch = previousFetch;
    clearUpdateCheckCache();
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
