const assert = require("node:assert/strict");
const test = require("node:test");
const profile = require("./altazor-desktop-profile.json");
const { diagnoseDesktopProfile, dockerDesktopRoot, localDesktopEngine } = require("./altazor-desktop-profile.cjs");

test("the installer checks only a local Linux engine and omits Host credentials", async () => {
  const calls = [];
  const result = await diagnoseDesktopProfile({
    platform: "linux", userId: 1500,
    env: { PATH: "/usr/bin", DOCKER_HOST: "tcp://outside.invalid:2375", DATABASE_URL: "fixture", SESSION_SECRET: "fixture" },
    async execute(file, args, options) {
      calls.push(args);
      assert.equal(file, "docker");
      assert.deepEqual(options.env, { PATH: "/usr/bin" });
      assert.equal(options.shell, false);
      if (args[2] === "version") return { stdout: "linux\n" };
      return { stdout: `sha256:${"a".repeat(64)} ${profile.id} ${profile.sourceCommit}\n` };
    },
  });
  assert.deepEqual(result, { state: "profile-detected" });
  assert.deepEqual(calls.map(args => args.slice(0, 2)), Array(2).fill(["--host", "unix:///run/user/1500/docker.sock"]));
  assert.equal(calls[1].at(-1), profile.tag);
});

test("a local engine can be present without the LexOpen profile", async () => {
  const result = await diagnoseDesktopProfile({
    platform: "win32",
    async execute(_file, args) {
      assert.equal(args[1], "npipe:////./pipe/dockerDesktopLinuxEngine");
      if (args[2] === "version") return { stdout: "linux" };
      return { stdout: `sha256:${"b".repeat(64)} unverified-profile ${profile.sourceCommit}` };
    },
  });
  assert.deepEqual(result, { state: "profile-pending" });
});

test("the check distinguishes a missing CLI, inaccessible daemon, and Windows container mode", async () => {
  const platform = "win32";
  const missing = await diagnoseDesktopProfile({ platform, async execute() { throw Object.assign(new Error("fixture"), { code: "ENOENT" }); } });
  const stopped = await diagnoseDesktopProfile({ platform, async execute() { throw new Error("fixture"); } });
  const windows = await diagnoseDesktopProfile({ platform, async execute() { return { stdout: "windows" }; } });
  assert.deepEqual([missing.state, stopped.state, windows.state], ["engine-missing", "engine-unavailable", "linux-engine-required"]);
});

test("detects a Windows Docker Desktop per-user install even when absent from PATH", async () => {
  const env = { LOCALAPPDATA: "C:\\Users\\Fixture\\AppData\\Local" };
  const root = `${env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources`;
  const binary = `${root}\\bin\\docker.exe`;
  const result = await localDesktopEngine({ platform: "win32", env, async execute(file, args) {
    if (file !== binary) throw Object.assign(new Error("Fixture"), { code: "ENOENT" });
    assert.equal(args[1], "npipe:////./pipe/dockerDesktopLinuxEngine");
    return { stdout: "linux" };
  } });
  assert.equal(result.binary, binary);
  assert.equal(dockerDesktopRoot("win32", env, result.binary), root);
});
