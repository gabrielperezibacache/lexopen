const assert = require("node:assert/strict");
const test = require("node:test");
const { createHash } = require("node:crypto");
const { lstat, mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { maximumArchiveBytes, toolpackName, selectOfficialToolpack, prepareDesktopToolpack } = require("./altazor-toolpack.cjs");
const profile = require("./altazor-desktop-profile.json");

const version = "2.1.0-preview.1";
const contents = Buffer.from("synthetic official archive bytes");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const name = toolpackName(version, "amd64");
const asset = {
  name, size: contents.length, digest: `sha256:${digest(contents)}`, state: "uploaded",
  browser_download_url: `https://github.com/gabrielperezibacache/lexopen/releases/download/v${version}/${name}`,
};
const release = { tag_name: `v${version}`, draft: false, assets: [asset] };
const releaseUrl = `https://api.github.com/repos/gabrielperezibacache/lexopen/releases/tags/v${version}`;
const cdn = "https://release-assets.githubusercontent.com/fake-signed-url";
const imageId = `sha256:${"a".repeat(64)}`;
const env = { PATH: "/fixture/bin", SESSION_SECRET: "fixture", DOCKER_HOST: "tcp://outside.invalid:2375" };

function localEngine() {
  const result = { loads: 0, staged: null, available: false, sourceBuilt: false, tags: 0 };
  result.execute = async (_binary, args, options) => {
    const socket = args.indexOf("--host");
    assert.match(args[socket + 1], /^(unix:\/\/|npipe:\/\/)/);
    assert.equal(options.env.SESSION_SECRET, undefined);
    assert.equal(options.env.DOCKER_HOST, undefined);
    assert.equal(options.shell, false);
    const [command, action] = args.slice(socket + 2);
    if (command === "version") return { stdout: args.at(-1) === "{{.Server.Arch}}" ? "amd64" : "linux" };
    assert.equal(command, "image");
    if (action === "load") {
      result.staged = args.at(-1);
      assert.deepEqual(await readFile(result.staged), contents);
      if (process.platform !== "win32") assert.equal((await lstat(result.staged)).mode & 0o077, 0);
      result.loads++;
      result.available = true;
      return { stdout: "fixture loaded" };
    }
    if (action === "tag") {
      assert.equal(args.at(-2), imageId);
      assert.equal(args.at(-1), profile.tag);
      result.tags++;
      result.available = true;
      return { stdout: "" };
    }
    assert.equal(action, "inspect");
    if (args.at(-1) === imageId ? !result.sourceBuilt : !result.available) throw new Error("Fixture: absent image");
    return { stdout: `${imageId} ${profile.id} ${profile.sourceCommit} amd64` };
  };
  return result;
}

function fetchOfficial(payload, redirect = cdn) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.credentials, "omit");
    assert.ok(options.signal instanceof AbortSignal);
    if (url === releaseUrl) {
      assert.equal(options.redirect, "error");
      return new Response(JSON.stringify(release));
    }
    assert.equal(options.redirect, "manual");
    if (url === asset.browser_download_url) return Response.redirect(redirect);
    assert.equal(url, cdn);
    return new Response(payload);
  };
  return { fetcher, calls };
}

test("package selection pins the exact release, platform, origin, hash and size", () => {
  assert.deepEqual(selectOfficialToolpack(release, version, "amd64"), { name, url: asset.browser_download_url, size: contents.length, sha256: digest(contents) });
  assert.equal(selectOfficialToolpack(release, "2.0.0", "amd64"), null);
  assert.equal(selectOfficialToolpack(release, version, "arm64"), null);
  assert.equal(selectOfficialToolpack({ ...release, draft: true }, version, "amd64"), null);
  for (const changed of [{ browser_download_url: "https://other.invalid/toolpack.tar.gz" }, { digest: null }, { state: "open" }, { size: maximumArchiveBytes + 1 }]) {
    assert.equal(selectOfficialToolpack({ ...release, assets: [{ ...asset, ...changed }] }, version, "amd64"), null);
  }
});

test("matching official bytes download automatically, load from private staging and are cleaned up", async () => {
  const engine = localEngine();
  const { fetcher, calls } = fetchOfficial(contents);
  const events = [];
  assert.deepEqual(await prepareDesktopToolpack(version, { execute: engine.execute, env, fetcher, progress: p => events.push(p) }), { state: "package-loaded" });
  assert.deepEqual(calls, [releaseUrl, asset.browser_download_url, cdn]);
  assert.deepEqual(events, [
    { state: "package-checking" }, { state: "package-downloading", percent: 0 },
    { state: "package-downloading", percent: 100 }, { state: "package-loading" },
  ]);
  assert.equal(engine.loads, 1);
  await assert.rejects(lstat(path.dirname(engine.staged)), { code: "ENOENT" });
});

test("wrong hash, excess bytes or a non-GitHub redirect never reach Docker load", async () => {
  const engine = localEngine();
  for (const wrong of [Buffer.alloc(contents.length, 1), Buffer.alloc(contents.length + 1, 1)]) {
    assert.deepEqual(await prepareDesktopToolpack(version, { execute: engine.execute, env, fetcher: fetchOfficial(wrong).fetcher }), { state: "package-mismatch" });
  }
  const { fetcher, calls } = fetchOfficial(contents, "https://other.invalid/asset");
  assert.deepEqual(await prepareDesktopToolpack(version, { execute: engine.execute, env, fetcher }), { state: "package-download-failed" });
  assert.deepEqual(calls, [releaseUrl, asset.browser_download_url]);
  assert.equal(engine.loads, 0);
});

test("missing Docker and an existing verified profile make no network request", async () => {
  const fetcher = async () => assert.fail("Unexpected network");
  const engine = localEngine();
  engine.available = true;
  assert.deepEqual(await prepareDesktopToolpack(version, { execute: engine.execute, fetcher }), { state: "profile-detected" });
  const execute = async () => { throw Object.assign(new Error("Fixture"), { code: "ENOENT" }); };
  assert.deepEqual(await prepareDesktopToolpack(version, { execute, fetcher }), { state: "engine-missing" });
});

test("absent official archive falls back to pinned bundled source, then verifies immutable image", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-toolpack-test-"));
  const source = path.join(root, "altazor-desktop-source");
  const engine = localEngine();
  const events = [];
  let staging;
  try {
    await mkdir(source);
    await writeFile(path.join(source, "manifest.json"), JSON.stringify({
      format: 1, profile: profile.id, sourceCommit: profile.sourceCommit, lumenCommit: profile.windowManagerCommit,
      file: "context.tar.gz", size: contents.length, sha256: digest(contents),
    }));
    await writeFile(path.join(source, "context.tar.gz"), contents);
    const options = {
      resourceRoot: root, execute: engine.execute, env, progress: p => events.push(p.state),
      fetcher: async url => { assert.equal(url, releaseUrl); return new Response(null, { status: 404 }); },
      build: async (_binary, args, command, context) => {
        assert.deepEqual(context, contents);
        assert.equal(args[0], "--config");
        const idFile = args[args.indexOf("--iidfile") + 1];
        staging = path.dirname(idFile);
        assert.deepEqual(args.slice(4), [
          "build", "--load", "--quiet", "--iidfile", idFile, "--build-arg", `LUMEN_COMMIT=${profile.windowManagerCommit}`,
          "--build-arg", `LEXOPEN_DESKTOP_PROFILE=${profile.id}`, "--build-arg", `LEXOPEN_DESKTOP_SOURCE=${profile.sourceCommit}`, "-",
        ]);
        assert.equal(command.timeout, 30 * 60_000);
        assert.equal(command.env.DOCKER_BUILDKIT, "1");
        assert.equal(command.env.SESSION_SECRET, undefined);
        await writeFile(idFile, imageId);
        engine.sourceBuilt = true;
      },
    };
    assert.deepEqual(await prepareDesktopToolpack(version, options), { state: "package-loaded" });
    assert.deepEqual(events, ["package-checking", "source-building"]);
    assert.equal(engine.loads, 0);
    assert.equal(engine.tags, 1);
    await assert.rejects(lstat(staging), { code: "ENOENT" });
    engine.available = false;
    await writeFile(path.join(source, "context.tar.gz"), Buffer.alloc(contents.length, 1));
    assert.deepEqual(await prepareDesktopToolpack(version, { ...options, build: () => assert.fail("Tampered source reached Docker") }), { state: "source-mismatch" });
    assert.equal(engine.tags, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
