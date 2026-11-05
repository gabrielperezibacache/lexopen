const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { maximumArchiveBytes, toolpackName, selectOfficialToolpack, lookupDesktopToolpack, loadVerifiedDesktopToolpack } = require("./altazor-toolpack.cjs");
const profile = require("./altazor-desktop-profile.json");

const version = "2.1.0-preview.1";
const contents = Buffer.from("synthetic official archive bytes");
const digest = "sha256:" + createHash("sha256").update(contents).digest("hex");
const name = toolpackName(version, "amd64");
const asset = { name, size: contents.length, digest, state: "uploaded", browser_download_url: `https://github.com/gabrielperezibacache/lexopen/releases/download/v${version}/${name}` };
const release = { tag_name: `v${version}`, draft: false, assets: [asset] };

test("package selection pins the exact release, platform, origin, hash and size", () => {
  assert.deepEqual(selectOfficialToolpack(release, version, "amd64"), { name, size: contents.length, sha256: digest.slice(7) });
  assert.equal(selectOfficialToolpack(release, "2.0.0", "amd64"), null);
  assert.equal(selectOfficialToolpack(release, version, "arm64"), null);
  assert.equal(selectOfficialToolpack({ ...release, draft: true }, version, "amd64"), null);
  for (const changed of [{ browser_download_url: "https://other.invalid/toolpack.tar.gz" }, { digest: null }, { state: "open" }, { size: maximumArchiveBytes + 1 }]) {
    assert.equal(selectOfficialToolpack({ ...release, assets: [{ ...asset, ...changed }] }, version, "amd64"), null);
  }
});

test("a changed archive never reaches Docker; matching bytes load from a private staged file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lexopen-toolpack-test-"));
  const file = path.join(directory, name);
  let loads = 0;
  const execute = async (_binary, args, options) => {
    assert.equal(args[0], "--host");
    assert.match(args[1], /^(unix:\/\/|npipe:\/\/)/);
    assert.equal(options.env.SESSION_SECRET, undefined);
    if (args[2] === "version") return { stdout: args[4] === "{{.Server.Arch}}" ? "amd64" : "linux" };
    if (args[3] === "load") {
      loads++;
      assert.notEqual(args.at(-1), file);
      assert.deepEqual(await readFile(args.at(-1)), contents);
      return { stdout: "fixture loaded" };
    }
    assert.equal(args.at(-1), profile.tag);
    return { stdout: `sha256:${"a".repeat(64)} ${profile.id} ${profile.sourceCommit} amd64` };
  };
  try {
    const verified = await lookupDesktopToolpack(version, {
      execute,
      env: { PATH: "/fixture/bin", SESSION_SECRET: "fixture", DOCKER_HOST: "tcp://outside.invalid:2375" },
      async fetcher(url, options) {
        assert.equal(url, `https://api.github.com/repos/gabrielperezibacache/lexopen/releases/tags/v${version}`);
        assert.equal(options.redirect, "error");
        assert.equal(options.credentials, "omit");
        return new Response(JSON.stringify(release));
      },
    });
    assert.equal(verified.state, "package-verified");
    await writeFile(file, Buffer.alloc(contents.length, 1));
    assert.deepEqual(await loadVerifiedDesktopToolpack(file, verified, { execute }), { state: "package-mismatch" });
    assert.equal(loads, 0);
    await writeFile(file, contents);
    assert.deepEqual(await loadVerifiedDesktopToolpack(file, verified, { execute }), { state: "package-loaded" });
    assert.equal(loads, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
